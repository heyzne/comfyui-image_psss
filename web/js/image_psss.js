/**
 * ComfyUI Image PSSS - 前端自定义脚本
 * 适配 ComfyUI 最新版
 * URL 输入框放在每个图片下方
 */

import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Comfy.ImagePSSS",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (["MultiImageLoader", "MultiImageLoaderEx", "ImageURLInput"].includes(nodeData.name)) {

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                const result = onNodeCreated?.apply(this, arguments);

                // 调整 URL 输入框样式
                for (let i = 1; i <= 10; i++) {
                    const urlWidget = this.widgets?.find(w => w.name === `url_${i}`);
                    if (urlWidget && urlWidget.element) {
                        const el = urlWidget.element;
                        el.style.fontFamily = "monospace";
                        el.style.fontSize = "11px";
                        el.style.padding = "4px 6px";
                    }
                }

                return result;
            };
        }
    },
});
