const {createServer}  = require("http");

const formidable = require("formidable");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");


const server = createServer(async function(request, response) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'OPTIONS, POST, GET, PUT, DELETE',
      };
    
    if (request.method === 'OPTIONS') {
        response.writeHead(204, headers);
        return response.end();
    }

    if(request.method === "POST") {
        const form = new formidable.IncomingForm({allowEmptyFiles: false, uploadDir: path.join(__dirname,"..", "uploads"), maxFileSize: Infinity});
        const fileInfo = await new Promise((resolve, reject) => {
            form.parse(request, (error, fields, files) => {
                if(error) {
                    return reject(error);
                }
                const oldpath = files.video.filepath;

                const id = randomUUID().replace(/-/g, "");
                const filename = `${id}_${files.video.originalFilename}`
                const newpath = path.join(__dirname, "..", "uploads", filename)
                fs.rename(oldpath, newpath, (err) => {
                    if(err) {
                        return reject(err);
                    }
                    return resolve({id, filename});
                });
            })
        });
        response.setHeader("Content-Type", "application/json");
        return response.end(JSON.stringify(fileInfo));
    }

    const videoURL = request.url.match(/\/video\/.+/gi);
    if(request.method === "GET" && videoURL.length > 0) {
        const videoId = videoURL[0].split("/")[2];
        const filename  = (await fs.promises.readdir(path.join(__dirname, "..", "uploads"))).find(i => i.indexOf(videoId) > -1);
        if(!filename) {
            response.setHeader("Content-Type", "application/json");
            response.writeHead(404, headers);
            return response.end(JSON.stringify({
                message: "Video not found!"
            }));
        }

        const VIDEO_BUFFER = 1024 * 1024; //1 MB
        const supportRange = !!request.headers["range"];

        if(!supportRange) {
            response.setHeader("Content-type", "video/mp4");
            response.writeHead(200, headers);
            console.log("Transmitindo video completo");
            await new Promise((resolve, reject) => {
                const videoStream = fs.createReadStream(path.join(__dirname, "..", "uploads", filename));
                videoStream.on("open", () => videoStream.pipe(response));
                videoStream.on("close", resolve);
                videoStream.on("error", reject);
            })
            return response.end();
        }

        function getFilesizeInBytes(filename) {
            var stats = fs.statSync(filename);
            var fileSizeInBytes = stats.size;
            return fileSizeInBytes;
        }

        const sizeFile = getFilesizeInBytes(path.join(__dirname, "..", "uploads", filename));

        let [startByte, endByte] = request.headers['range'].split("=")[1].split('-');
        startByte = parseInt(startByte);
        if(!endByte) {
            endByte = startByte+VIDEO_BUFFER;
            if(sizeFile >= endByte) {
                endByte = sizeFile-1;
            }
        }


        response.setHeader("Accept-Ranges", "bytes");
        response.setHeader("Content-type", "video/mp4");
        response.setHeader("Content-Length", (endByte - startByte) + 1 );
        response.setHeader("Content-Range", `bytes ${startByte}-${endByte}/${sizeFile}`);
        response.writeHead(206, headers);

        const videoStream = fs.createReadStream(path.join(__dirname, "..", "uploads", filename), {start: startByte, end: endByte});
        videoStream.pipe(response);

        await new Promise(resolve => {
            response.on("close", resolve);
        });
        return response.end();
    }

    response.writeHead(404);
    return response.end(JSON.stringify({message:"Route not found !"}));
});


server.listen(3333, () => {
    console.log("🔥 Projeto rodando!");
});