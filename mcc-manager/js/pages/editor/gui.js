//region: Helpers
onPdReady = async (callback)=>{
    if (!window.pd) {
        if (typeof window.subscribeOnPdLoaded === "function") {
            window.subscribeOnPdLoaded(callback);
        } else {
            console.warn("[Editor.GUI] subscribeOnPdLoaded is not a function");
        }
    } else {
        callback();
    }
};

onDocReady = async (callback)=>{
    if (document.readyState !== "complete") {
        document.addEventListener("DOMContentLoaded", callback);
    } else {
        callback();
    }
};

onEventsAvaliable = async (callback, timeoutMs=10000, checkIntervalMs=100)=>{
    // Ensures we can window.subscribeOnEditorChange, window.subscribeOnEditorSave
    // If not avaliable it will wait max timeoutMs for it to be avaliable, checking every checkIntervalMs
    if (typeof window.subscribeOnEditorChange === "function" && typeof window.subscribeOnEditorSave === "function") {
        return callback();
    }
    
    // Non busy wait for checkIntervalMs until timeoutMs is reached
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        if (typeof window.subscribeOnEditorChange === "function" && typeof window.subscribeOnEditorSave === "function") {
            return callback();
        }
        await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }

    // Log
    throw new Error("[Editor.GUI] Events not avaliable after timeout of " + timeoutMs + "ms, checked every " + checkIntervalMs + "ms");
};

function log(...data) {
    if (typeof window.logIfEvOutEnabled === "function") {
        window.logIfEvOutEnabled(...data);
    } else {
        console.log(...data);
    }
}
//endregion: Helpers

onChangeToGuiTab = async ()=>{
    await onPdReady(async ()=>{
        await onDocReady(async ()=>{
            await onEventsAvaliable(async ()=>{
                log("[Editor.GUI] GUI tab loaded! (DOC+PD+Events)");
            });
        });
    });
};