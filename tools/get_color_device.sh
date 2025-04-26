#wget -O output.txt "http://localhost:8080/term/device/$1"
#echo "RENDER"
#cat output.txt

#!/bin/bash

# Codificamos el device_id (por ejemplo: AA:BB:CC:DD:EE:FF -> AA%3ABB%3ACC%3ADD%3AEE%3AFF)
DEVICE_ID=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$1")

# Ejecutamos la petición usando wget y guardamos la salida
wget -q -O output.txt "http://localhost:8080/term/device/$DEVICE_ID"

# Mostramos el resultado
echo "RENDER"
cat output.txt
