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
        context.log('request from ' + userName + " for " + frames + " frames.");
        context.log('Sanity checking route contents...');
        context.log(uuid);
        // Length validation
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

        // Validate contents of the route.
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
        
        // Check # of frames.
        const bestFrames = parseInt(context.bindings.fastestTime);
        context.log('Current max frames: ' + bestFrames);
        const numberFrames = parseInt(frames);
        if (numberFrames && numberFrames >= 0) {
            if (bestFrames > numberFrames) {
                context.log('New best found, writing output...');
                context.bindings.newRecipe = routeContent;
                try {
                    const updateLeaderboardResult = await updateLeaderboard(userName, numberFrames);
                    if (updateLeaderboardResult) {
                        context.res = {
                            status: 200,
                            body: "New fastest record uploaded to server."
                        };
                        if (bestFrames > numberFrames) {
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
                        context.done();
                        return;
                    } else {
                        context.res = {
                            status: 400,
                            body: "There was some error with attempting to update the leaderboard. You may have a current fastest record. Please notify someone in the TTYD discord. UUID: " + uuid
                        };
                        context.done();
                        return;
                    }
                } catch (e) {
                    context.res = {
                        status: 400,
                        body: "There was some error with attempting to update the leaderboard. You may have a current fastest record. Please notify someone in the TTYD discord. UUID: " + uuid
                    };
                    context.done();
                    return;
                }
            } else {
                context.log('Current framecount does not exceed fastest, but may exceed user current record. Updating LB...');
                try {
                    const updateLeaderboardResult = await updateLeaderboard(userName, numberFrames);
                    if (updateLeaderboardResult && updateLeaderboardResult > numberFrames) {
                        context.res = {
                            status: 200,
                            body: "You did not set a new WR, but you did set a new PB of " + numberFrames + ", beating your previous record by " + (updateLeaderboardResult - numberFrames) + ". If your result is in the top 50, you will be on the website!"
                        };
                        context.done();
                        return;
                    } else {
                        context.res = {
                            status: 200,
                            body: "You did not set a new PB. The server's current PB for you is " + updateLeaderboardResult ?? "unknown" + "."
                        };
                        context.done();
                        return;
                    }
                } catch (e) {
                    context.res = {
                        status: 400,
                        body: "There was some error with attempting to update the leaderboard. You may have a new PB (but not a WR). Please notify someone in the TTYD discord. UUID: " + uuid
                    };
                    context.done();
                    return;
                }
            }
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

async function updateLeaderboard(userName: string, numberFrames: number): Promise<number> {
    const tableService = createTableService(process.env["AzureWebJobsStorage"]);
    const promiseCreateTable = promisify((tableName, callback) => tableService.createTableIfNotExists(
        tableName,
        (error, result, other_stuff) => callback(error, result)
    ));
    try {
        await promiseCreateTable('fastestLeaderboard');
    } catch (error) {
        throw Error('Error updating leaderboard: Unable to locate / create table.')
    }

    const promiseRetrieveEntitiy = promisify((table, partKey, rowKey, cb) => tableService.retrieveEntity(
        table,
        partKey,
        rowKey,
        (error, result, other_stuff) => cb(error, result)
    ));

    let oldFramecount;
    try {
        const row = await promiseRetrieveEntitiy('fastestLeaderboard', 'frameCount', userName);
        oldFramecount = (row as any).numFrames._;
        if (oldFramecount <= numberFrames) {
            // Not a new fastest.
            return oldFramecount;
        }
    } catch (error) {
        // Ignore this error, it means there's no entity yet.
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
    } catch (error) {
        throw Error('Error updating leaderboard: Unable to insert / update row.')
    }

    return oldFramecount;
}

export default httpTrigger;
