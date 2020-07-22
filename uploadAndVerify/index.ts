import { AzureFunction, Context, HttpRequest } from "@azure/functions"

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    context.log('Got request');
    if (req.body && req.body.userName && req.body.frames && req.body.routeContent) {
        const { frames, routeContent } = req.body;
        context.log('Sanity checking route contents...');
        if (routeContent.length > 100000) {
            context.res = {
                status: 200,
                body: "Your spoon is too big."
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
                body: "You did it. Good job."
            };
            context.done();
            return;
        } else {
            context.res = {
                status: 200,
                body: "Not fast enough, try again."
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
