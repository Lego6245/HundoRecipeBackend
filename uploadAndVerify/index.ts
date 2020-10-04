import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { createTableService, TableUtilities } from 'azure-storage';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    context.log('Got request');
    const uuid = uuidv4();
    if (req.body && req.body.userName && req.body.frames && req.body.routeContent) {
        const { userName, frames, routeContent } = req.body;
        context.log('Sanity checking route contents...');
        context.log(uuid);
        if (routeContent.length > 100000) {
            context.log('Size too big. Over 100k bytes with size ' + routeContent.length);
            context.res = {
                status: 400,
                body: "There was an error with your file. If you're confident this file is accurate, please notify someone in the TTYD discord. UUID: " + uuid
            };
            context.done();
            return;
        }
        if (routeContent.length < 10000) {
            context.log('Size too small. Under 10k bytes with size ' + routeContent.length);
            context.res = {
                status: 400,
                body: "There was an error with your file. If you're confident this file is accurate, please notify someone in the TTYD discord. UUID: " + uuid
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
                        body: "There was an error with your file. If you're confident this file is accurate, please notify someone in the TTYD discord. UUID: " + uuid
                    };
                    context.done();
                    return;
                }
                if (tabContents[0].indexOf('<Mistake>') < 0) {
                    context.log('No mistake as last item made.');
                    context.res = {
                        status: 400,
                        body: "There was an error with your file. If you're confident this file is accurate, please notify someone in the TTYD discord. UUID: " + uuid
                    };
                    context.done();
                    return;
                }
            } else {
                context.log('Error splitting tab contents');
                context.res = {
                    status: 400,
                    body: "There was an error with your file. If you're confident this file is accurate, please notify someone in the TTYD discord. UUID: " + uuid
                };
                context.done();
                return;
            }
        } else {
            context.log('Error splitting route contents');
            context.res = {
                status: 400,
                body: "There was an error with your file. If you're confident this file is accurate, please notify someone in the TTYD discord. UUID: " + uuid
            };
            context.done();
            return;
        }
        const bestFrames = parseInt(context.bindings.fastestTime);
        context.log('Current max frames: ' + bestFrames);
        const numberFrames = parseInt(frames);
        if (numberFrames && numberFrames >= 0) {
            if (bestFrames > numberFrames) {
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
            }
            const tableService = createTableService(process.env["AzureWebJobsStorage"]);
            const promiseCreateTable = promisify((tableName, callback) => tableService.createTableIfNotExists(
                tableName,
                (error, result, other_stuff) => callback(error, result)
            ));
            try {
                await promiseCreateTable('fastestLeaderboard');
            } catch (error) {
                context.log('Error finding leaderboard table');
                context.log(error);
                context.res = {
                    status: 400,
                    body: "Sorry, you were not the fastest. There was also an error updating the leaderboards. UUID: " + uuid
                };
                context.done();
                return;
            }
            context.log('Table found');

            const promiseRetrieveEntitiy = promisify((table, partKey, rowKey, cb) => tableService.retrieveEntity(
                table,
                partKey,
                rowKey,
                (error, result, other_stuff) => cb(error, result)
            ));
            try {
                const row = await promiseRetrieveEntitiy('fastestLeaderboard', 'frameCount', userName);
                if ((row as any).numFrames._ <= numberFrames) {
                    context.log('Leaderboard already has a faster record for ' + userName);
                    context.res = {
                        status: 200,
                        body: "Sorry, you were not the fastest, and your record was not faster than your current known fastest."
                    };
                    context.done();
                    return;
                }
            } catch (error) {
                context.log('Some unimportant error retriving the row');
                context.log(error);
            }

            const entGen = TableUtilities.entityGenerator;
            const newEnt = {
                PartitionKey: entGen.String('frameCount'),
                RowKey: entGen.String(userName),
                numFrames: numberFrames,
            }
            const promiseInsertOrReplace = promisify((table, entity, cb) => tableService.insertOrReplaceEntity(
                table,
                entity,
                (error, result, other_stuff) => cb(error, result)
            ));
            try {
                await promiseInsertOrReplace('fastestLeaderboard', newEnt);
                context.log('Leaderboard updated with new frame record for ' + userName + ' : ' + numberFrames);
                context.res = {
                    status: 200,
                    body: "Sorry, you were not the fastest. However, you did set a new personal best, so the leaderboard was updated."
                };
            } catch (error) {
                context.log('There was an error updating the leaderboard for ' + userName);
                context.log(error);
                context.res = {
                    status: 400,
                    body: "Sorry, you were not the fastest. There was also an error updating the leaderboards. UUID: " + uuid
                };
            }
            context.done();
            return;
        } else {
            context.res = {
                status: 400,
                body: "There was an error with your file. If you're confident this file is accurate, please notify someone in the TTYD discord. UUID: " + uuid
            };
            context.done();
            return;
        }
    } else {
        context.res = {
            status: 400,
            body: "Invalid request shape. UUID: " + uuid
        };
        context.done();
        return;
    }
};

export default httpTrigger;
