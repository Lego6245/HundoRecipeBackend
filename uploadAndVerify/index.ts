import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import fetch from 'node-fetch';

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    context.log('Got request');
    if (req.body && req.body.userName && req.body.frames && req.body.routeContent) {
        const { userName, frames, routeContent } = req.body;
        context.log('Sanity checking route contents...');
        if (routeContent.length > 100000) {
            context.log('Size too big. Over 100k bytes with size ' + routeContent.length);
            context.res = {
                status: 400,
                body: "There was an error with your file. If you're confident this file is accurate, please notify someone in the TTYD discord."
            };
            context.done();
            return;
        }
        if (routeContent.length < 10000) {
            context.log('Size too small. Under 10k bytes with size ' + routeContent.length);
            context.res = {
                status: 400,
                body: "There was an error with your file. If you're confident this file is accurate, please notify someone in the TTYD discord."
            };
            context.done();
            return;
        }
        const splitContents = routeContent.split('\n');
        if (!!splitContents) {
            const splitMe = splitContents[splitContents.length - 1].length > 5 ? splitContents[splitContents.length - 1] : splitContents[splitContents.length - 2]
            const tabContents = splitMe.split('\t');
            if (!!tabContents) {
                if (tabContents[2] != frames) {
                    context.log('Frame count did not match on last line.');
                    context.res = {
                        status: 400,
                        body: "There was an error with your file. If you're confident this file is accurate, please notify someone in the TTYD discord."
                    };
                    context.done();
                    return;
                }
                if (tabContents[0].indexOf('<Mistake>') < 0) {
                    context.log('No mistake as last item made.');
                    context.res = {
                        status: 400,
                        body: "There was an error with your file. If you're confident this file is accurate, please notify someone in the TTYD discord."
                    };
                    context.done();
                    return;
                }
            } else {
                context.log('Error splitting tab contents');
                context.res = {
                    status: 400,
                    body: "There was an error with your file. If you're confident this file is accurate, please notify someone in the TTYD discord."
                };
                context.done();
                return;
            }
        } else {
            context.log('Error splitting route contents');
            context.res = {
                status: 400,
                body: "There was an error with your file. If you're confident this file is accurate, please notify someone in the TTYD discord."
            };
            context.done();
            return;
        }
        const bestFrames = parseInt(context.bindings.fastestTime);
        context.log('Current max frames: ' + bestFrames);
        const numberFrames = parseInt(frames);
        if (numberFrames && numberFrames >= 0 && bestFrames > numberFrames) {
            context.log('New best found, writing output...');
            context.bindings.newRecipe = routeContent;
            context.res = {
                status: 200,
                body: "New fastest record uploaded to server."
            };
            if (process.env["DiscordWebhook"]) {
                await fetch(process.env["DiscordWebhook"], {
                    method: 'post',
                    body: JSON.stringify({
                        content: "A new fastest recipe route was found by " + userName + " that is " + frames + " frames, an improvement of " + (bestFrames - frames) + " frames over the previous record."
                    }),
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            context.done();
            return;
        } else {
            context.res = {
                status: 400,
                body: "This file does not beat the current known fastest record, or the frames value is invalid."
            };
            context.done();
            return;
        }
    } else {
        context.res = {
            status: 400,
            body: "Invalid request shape."
        };
        context.done();
        return;
    }
};

export default httpTrigger;
