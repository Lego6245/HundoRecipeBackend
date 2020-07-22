import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import * as ftp from 'basic-ftp';
import { promises as fsPromises } from 'fs';

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const file_name_regex = /\[([^\s\]]*)\]/;
    context.log('Got request');
    if (req.body && req.body.frames && req.body.routeContent) {
        context.log('Sanity checking route contents...');
        if (req.body.routeContent.length > 100000) {
            context.res = {
                status: 200,
                body: "Your spoon is too big."
            };
            return;
        }
        context.log('Opening FTP connection...');
        const ftpClient = new ftp.Client();
        await ftpClient.access({
            host: process.env["FTPHost"],
            user: process.env["FTPUser"],
            password: process.env["FTPPassword"]
        });
        await ftpClient.cd(process.env["ResultsWD"]);
        context.log('Checking for max frames...');
        const currentFiles = await ftpClient.list();
        context.log('Sorting list...');
        const frameCounts = currentFiles.map(val => {
            const matches = val.name.match(file_name_regex);
            if (matches && matches.length == 2) {
                const frameCount = parseInt(matches[1]);
                return !!frameCount ? frameCount : undefined;
            }
        });
        frameCounts.filter(val => !!val);
        frameCounts.sort();
        const bestFrames = frameCounts[0];
        context.log('Current max frames: ' + bestFrames);
        if (bestFrames > req.body.frames) {
            console.log('Better than current frames, sanity checking...');
            let userName = req.body.userName;
            if (!userName) {
                userName = "STILL_GARBAGE_PLS_IGNORE";
            }
            const fileName = '[' + req.body.frames + ']_' + userName + '.txt';
            const tempDir = "D:\\local\\Temp\\" + fileName;
            await fsPromises.writeFile(tempDir, req.body.routeContent);
            await ftpClient.upload(tempDir, fileName);
            await fsPromises.unlink(tempDir);
        } else {
            context.res = {
                status: 200,
                body: "Not fast enough, try again."
            };
        }
    } else {
        context.res = {
            status: 400,
            body: "Invalid request shape."
        };
    }
};

export default httpTrigger;
