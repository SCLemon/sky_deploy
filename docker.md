
建立 Docker Network
docker network create sky_net


安裝 Docker Container

docker run -it --name sky --network sky_net -p 80:80 -p 443:443 ubuntu:22.04 bash
docker run -d --name sky_mongo --network sky_net -v D:\sky_docker_mongodb:/data/db mongo:8.0



開啟

docker exec -it <container_id_or_name> bash

停止
docker stop <container_id_or_name>

離開

exit


設置主專案 Docker 環境

1. 更新 apt 套件
apt update && apt upgrade -y


2. 安裝 Node.js 與 npm
安裝 curl
apt install -y curl

-

安裝 Node
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs


檢查 node 和 npm 版本
node -v
npm -v

