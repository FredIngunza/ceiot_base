const express = require("express");
const bodyParser = require("body-parser");
const {MongoClient} = require("mongodb");
const PgMem = require("pg-mem");


const db = PgMem.newDb();
    const render = require("./render.js");
// Measurements database setup and access

let database = null;
const collectionName = "measurements";

async function startDatabase() {
    const uri = "mongodb://localhost:27017/?maxPoolSize=20&w=majority";	
    const connection = await MongoClient.connect(uri, {useNewUrlParser: true});
    database = connection.db();
}

async function getDatabase() {
    if (!database) await startDatabase();
    return database;
}

async function insertMeasurement(message) {
    const {insertedId} = await database.collection(collectionName).insertOne(message);
    return insertedId;
}

async function getMeasurements() {
    return await database.collection(collectionName).find({}).toArray();	
}

// API Server

const app = express();

app.use(bodyParser.urlencoded({extended:false}));
app.use(bodyParser.json());


app.use(express.static('spa/static'));

const PORT = 8080;

/* Version deprecada
app.post('/measurement', function (req, res) {
    console.log("device id    : " + req.body.id + 
                " key         : " + req.body.key + 
                " temperature : " + req.body.t + 
                " humidity    : " + req.body.h);	
    const {insertedId} = insertMeasurement({id:req.body.id, t:req.body.t, h:req.body.h});
    res.send("received measurement into " + insertedId);
});
*/


// Desafío 01 y 04 - Versión con validación de campo 'key' y Token
app.post('/measurement', async function (req, res) {
    const { id, t, h, key } = req.body;

    // Validar que 'key' (token) esté presente (reto fix_key)
    if (!key || key.trim() === "") {
        console.warn("Missing or empty 'key' field.");
        return res.status(400).send({ error: "Missing or empty 'key' field." });
    }

    // Validar que el token coincida con el device_id
    try {
        console.log(`Verificando device_id=${id} con token=${key}`);
        const query = `
            SELECT * FROM devices
            WHERE device_id = '${id}'
            AND token = '${key}'
        `;
        console.log("Consulta ejecutada:\n", query);

        const result = await db.public.many(query);
        console.log("Resultado de la consulta:", result);

        if (result.length === 0) {
            console.warn(`Rejected: Token mismatch for device_id=${id}`);
            return res.status(401).send({ error: "Unauthorized: Invalid token for this device_id." });
        }

        // Registro exitoso en measurements
        await db.public.none(
            `INSERT INTO measurements (device_id, t, h) VALUES ('${id}', ${parseFloat(t)}, ${parseFloat(h)})`
        );

        console.log(`Measurement accepted for device_id=${id}`);
        res.send(`received measurement for device_id=${id}\n`);

    } catch (error) {
        console.error("Server error during token validation:", error);
        res.status(500).send({ error: "Server error during token check" });
    }
});
  

/* Version deprecada
app.post('/device', function (req, res) {
	console.log("device id    : " + req.body.id + " name        : " + req.body.n + " key         : " + req.body.k );

    db.public.none("INSERT INTO devices VALUES ('"+req.body.id+ "', '"+req.body.n+"', '"+req.body.k+"')");
	res.send("received new device");
});
*/

// Desafio 02 - Versión de registro de dispositivo con id mac
app.post('/device', function (req, res) {
    const { id, n, k, t } = req.body; // t es token

    // Validar formato MAC address
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    if (!macRegex.test(id)) {
        console.warn("Rejected: Invalid MAC address format.");
        return res.status(400).send({ error: "Invalid MAC address format for 'id'." });
    }

    console.log(`device MAC: ${id} | name: ${n} | key: ${k} | token: ${t}`);
    db.public.none(
        `INSERT INTO devices (device_id, name, key, token) VALUES ('${id}', '${n}', '${k}', '${t}')`
    );
    res.send("received new device with MAC address and token" + "\n");
});


app.get('/web/device', function (req, res) {
    var devices = db.public.many("SELECT * FROM devices").map(function (device) {
      return '<tr><td><a href=/web/device/' + device.device_id + '>' + device.device_id + '</a></td>' +
             "<td>" + device.name + "</td>" +
             "<td>" + device.key + "</td></tr>";
    });
  
    res.send("<html>" +
      "<head><title>Sensores</title></head>" +
      "<body>" +
      "<table border=\"1\">" +
      "<tr><th>id</th><th>name</th><th>key</th></tr>" + 
      devices.join('') +
      "</table>" +
      "</body>" +
      "</html>");
  });
  


// Desafio 03 - Actualización del dispositivo
app.post('/web/device/:id/edit', function (req, res) {
    const id = req.params.id;
    const { n, k } = req.body;

    db.public.none(
        `UPDATE devices SET name = '${n}', key = '${k}' WHERE device_id = '${id}'`
    );
    
    console.log(`Device ${id} updated -> name: ${n}, key: ${k}`);
    res.redirect('/web/device');
});

// Desafio 03 - Eliminar dispositivo por ID
app.post('/web/device/:id/delete', function (req, res) {
    const id = req.params.id;

    db.public.none(`DELETE FROM devices WHERE device_id = '${id}'`);
    console.log(`Device ${id} eliminado correctamente`);
    
    res.redirect('/web/device');
});



/*
app.get('/web/device/:id', function (req,res) {
    var template = "<html>"+
                     "<head><title>Sensor {{name}}</title></head>" +
                     "<body>" +
		        "<h1>{{ name }}</h1>"+
		        "id  : {{ id }}<br/>" +
		        "Key : {{ key }}" +
                     "</body>" +
                "</html>";


    var device = db.public.many("SELECT * FROM devices WHERE device_id = '"+req.params.id+"'");
    console.log(device);
    res.send(render(template,{id:device[0].device_id, key: device[0].key, name:device[0].name}));
});	
*/

// Desafio 03 - Renderiza formulario de edición (versión robusta)
app.get('/web/device/:id', function (req, res) {
    const id = req.params.id;
    const device = db.public.many("SELECT * FROM devices WHERE device_id = '"+id+"'");
    console.log(device);

    const template = `
    <html>
      <head><title>Editar dispositivo</title></head>
      <body>
        <h1>Editar dispositivo</h1>
        <form method="POST" action="/web/device/${id}/edit">
          <label>ID:</label><br/>
          <input type="text" name="id" value="${device[0].device_id}" readonly /><br/><br/>
          
          <label>Nombre:</label><br/>
          <input type="text" name="n" value="${device[0].name}" /><br/><br/>
          
          <label>Clave:</label><br/>
          <input type="text" name="k" value="${device[0].key}" /><br/><br/>
          
          <button type="submit"> Guardar cambios</button>
        </form>

        <br/>
        <form method="POST" action="/web/device/${id}/delete" onsubmit="return confirm('¿Seguro que deseas eliminar este dispositivo?')">
          <button type="submit" style="color:red;"> Eliminar dispositivo</button>
        </form>

        <br/>
        <a href="/web/device">⬅ Volver</a>
      </body>
    </html>`;

    res.send(template);
});


app.get('/term/device/:id', function (req, res) {
    var red = "\33[31m";
    var green = "\33[32m";
    var blue = "\33[33m";
    var reset = "\33[0m";
    var template = "Device name " + red   + "   {{name}}" + reset + "\n" +
		   "       id   " + green + "       {{ id }} " + reset +"\n" +
	           "       key  " + blue  + "  {{ key }}" + reset +"\n";
    var device = db.public.many("SELECT * FROM devices WHERE device_id = '"+req.params.id+"'");
    console.log(device);
    res.send(render(template,{id:device[0].device_id, key: device[0].key, name:device[0].name}));
});


// Endpoint GET /measurement - Mostrar mediciones registradas
// Endpoint GET /measurement - Devolver mediciones como JSON
app.get('/measurement', async function (req, res) {
    try {
        const measurements = await db.public.many("SELECT * FROM measurements");
        res.json(measurements);
    } catch (error) {
        console.error("Error retrieving measurements:", error);
        res.status(500).send({ error: "Error retrieving measurements" });
    }
});




/* Codigo deprecado
app.get('/device', function(req,res) {
    res.send( db.public.many("SELECT * FROM devices") );
});
*/

// Ocultar token de la web interna
app.get('/device', async function (req, res) {
    try {
      const devices = await db.public.many("SELECT device_id, name, key FROM devices");
      res.json(devices);
    } catch (error) {
      console.error("Error fetching devices:", error);
      res.status(500).send({ error: "Error fetching devices" });
    }
  });
  

startDatabase().then(async() => {

    const addAdminEndpoint = require("./admin.js");
    addAdminEndpoint(app, render);

/*
    await insertMeasurement({id:'00', t:'18', h:'78'});
    await insertMeasurement({id:'00', t:'19', h:'77'});
    await insertMeasurement({id:'00', t:'17', h:'77'});
    await insertMeasurement({id:'01', t:'17', h:'77'});
*/


    console.log("mongo measurement database Up");

    // Crear tablas
    db.public.none("CREATE TABLE devices (device_id VARCHAR, name VARCHAR, key VARCHAR, token VARCHAR)"); //Dispositivos
    db.public.none("CREATE TABLE measurements (device_id VARCHAR, t FLOAT, h FLOAT)");  //Mediciones
    db.public.none("CREATE TABLE users (user_id VARCHAR, name VARCHAR, key VARCHAR)");  // Usuarios

    // Datos de prueba
    db.public.none("INSERT INTO devices VALUES ('00', 'Fake Device 00', '123456', 'token123')");
    db.public.none("INSERT INTO devices VALUES ('01', 'Fake Device 01', '234567', 'token234')");
    db.public.none("INSERT INTO devices VALUES ('AA:BB:CC:DD:EE:FF', 'Sensor MAC', 'clave123', 'mac-token')");
    db.public.none("INSERT INTO users VALUES ('1','Ana','admin123')");
    db.public.none("INSERT INTO users VALUES ('2','Beto','user123')");


    console.log("sql device database up");

    app.listen(PORT, () => {
        console.log(`Listening at ${PORT}`);
    });
});
