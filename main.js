const app = require('photoshop').app;
const { executeAsModal } = require('photoshop').core;
const { batchPlay } = require("photoshop").action;

const colorMapping = {
    'none': { label: '无颜色', class: 'no-color' },
    'red': { label: '红色', class: 'red' },
    'orange': { label: '橙色', class: 'orange' },
    'yellowColor': { label: '黄色', class: 'yellow' },
    'grain': { label: '绿色', class: 'green' },
    'seafoam': { label: '海泡绿', class: 'seafoam' },
    'blue': { label: '蓝色', class: 'blue' },
    'indigo': { label: '靛蓝', class: 'indigo' },
    'magenta': { label: '洋红', class: 'magenta' },
    'fuchsia': { label: '紫红', class: 'fuchsia' },
    'violet': { label: '紫色', class: 'violet' },
    'gray': { label: '灰色', class: 'gray' }
};

async function getLayerInfo(layer) {
    try {
        let retries = 3;
        while (retries > 0) {
            try {
                const result = await batchPlay(
                    [
                        {
                            _obj: "get",
                            _target: [
                                {
                                    _ref: "layer",
                                    _id: layer.id
                                }
                            ],
                            _options: {
                                dialogOptions: "dontDisplay"
                            }
                        }
                    ],
                    {
                        synchronousExecution: true,
                        modalBehavior: "execute"
                    }
                );
                return result[0];
            } catch (err) {
                retries--;
                if (retries === 0) throw err;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    } catch (err) {
        console.error(`获取图层 "${layer.name}" 信息时出错:`, err);
        return null;
    }
}

// 添加图层颜色缓存
const layerCache = {
    colorMap: new Map(), // 缓存图层颜色信息
    
    async getLayerColor(layer) {
        try {
            if (!layer || !layer.id) return null;
            
            if (this.colorMap.has(layer.id)) {
                return this.colorMap.get(layer.id);
            }
            
            const layerInfo = await getLayerInfo(layer);
            const color = layerInfo?.color?._value || null;
            if (layer.id) {
                this.colorMap.set(layer.id, color);
            }
            return color;
        } catch (err) {
            console.error(`获取图层颜色时出错:`, err);
            return null;
        }
    },
    
    clear() {
        this.colorMap.clear();
    }
};

// 优化的切换图层可见性函数
async function toggleLayersByColor(color, visible) {
    try {
        // 检查是否有活动文档
        if (!app.activeDocument) {
            console.log('没有打开的文档');
            return;
        }

        await executeAsModal(async () => {
            try {
                const doc = app.activeDocument;
                if (!doc || !doc.layers) {
                    console.log('无法访问文档图层');
                    return;
                }

                const layersToToggle = [];

                async function collectLayers(layer) {
                    try {
                        if (!layer) return;
                        
                        if (layer.layers && layer.layers.length > 0) {
                            for (const childLayer of layer.layers) {
                                await collectLayers(childLayer);
                            }
                        } else {
                            // 清除该图层的缓存，强制重新获取颜色
                            layerCache.colorMap.delete(layer.id);
                            const layerColor = await layerCache.getLayerColor(layer);
                            
                            // 只有当颜色匹配时才添加到待处理列表
                            if ((color === 'none' && !layerColor) || layerColor === color) {
                                layersToToggle.push(layer);
                            }
                        }
                    } catch (err) {
                        console.error(`处理图层时出错:`, err);
                    }
                }

                // 收集所有需要修改的图层
                for (const layer of doc.layers) {
                    if (layer) {
                        await collectLayers(layer);
                    }
                }

                // 直接修改图层可见性
                layersToToggle.forEach(layer => {
                    try {
                        if (layer && typeof layer.visible !== 'undefined') {
                            layer.visible = visible;
                        }
                    } catch (err) {
                        console.error(`修改图层可见性时出错:`, err);
                    }
                });

            } catch (err) {
                console.error('执行图层操作时出错:', err);
            }
        }, { commandName: '切换图层可见性' });
    } catch (err) {
        console.error('切换图层可见性时出错:', err);
    }
}

// 移到外部的处理队列函数
async function processClicks(pendingClicks, isProcessing) {
    if (isProcessing) return;
    isProcessing = true;

    try {
        while (pendingClicks.size > 0) {
            const entries = Array.from(pendingClicks.entries());
            pendingClicks.clear();

            const promises = entries.map(async ([color, data]) => {
                try {
                    await toggleLayersByColor(color, data.state);
                } catch (err) {
                    console.error(`处理颜色 ${color} 时出错:`, err);
                    data.element.innerHTML = data.state ? eyeClosedSVG : eyeOpenSVG;
                    colorStates.setVisibility(color, !data.state);
                }
            });

            await Promise.all(promises);
        }
    } finally {
        isProcessing = false;
    }
}

// 辅助函数：更新颜色组状态
function updateColorGroupState(colorGroup, newState) {
    const color = colorGroup.dataset.color;
    const toggleElement = colorGroup.querySelector('.visibility-toggle');
    
    toggleElement.innerHTML = newState ? eyeOpenSVG : eyeClosedSVG;
    colorGroup.dataset.visible = newState;
    colorStates.setVisibility(color, newState);
}

// 优化的事件处理函数
function initializeEventHandlers(container) {
    let isProcessing = false;
    let pendingClicks = new Map();
    
    container.addEventListener('click', async (event) => {
        const colorGroup = event.target.closest('.color-group');
        if (!colorGroup || isProcessing) return;

        const color = colorGroup.dataset.color;
        if (!color) return;

        if (event.shiftKey) {
            // Shift + 点击：设置选中图层的颜色
            await setLayerColor(color);
        } else if (event.altKey) {
            // Alt + 点击处理保持不变
            if (soloState.active && soloState.soloColor === color) {
                // ... Alt点击恢复代码保持不变 ...
            } else {
                // ... Alt点击独显代码保持不变 ...
            }
        } else {
            // 普通点击保持不变
            const newState = !colorStates.getVisibility(color);
            const toggleElement = colorGroup.querySelector('.visibility-toggle');
            
            updateColorGroupState(colorGroup, newState);
            pendingClicks.set(color, {
                element: toggleElement,
                state: newState
            });
            await processClicks(pendingClicks, isProcessing);
        }
    });
}

// 修改初始化颜色组函数，显示所有可用颜色
async function initializeColorGroups() {
    const container = document.getElementById('container');
    container.innerHTML = '';
    
    // 直接使用所有定义的颜色
    const allColors = Object.keys(colorMapping);
    
    for (const color of allColors) {
        const colorGroupHTML = createColorGroup(color);
        if (colorGroupHTML) {
            container.insertAdjacentHTML('beforeend', colorGroupHTML);
        }
    }

    initializeEventHandlers(container);
}

// 添加一个状态管理对象
const colorStates = {
    states: new Map(),
    
    // 获取颜色的可见状态
    getVisibility(color) {
        return this.states.get(color) ?? true; // 默认为 true
    },
    
    // 设置颜色的可见状态
    setVisibility(color, visible) {
        this.states.set(color, visible);
    }
};

// 修改 SVG 图标为 Photoshop 原生样式
const eyeOpenSVG = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 3C4.5 3 1.5 5.5 0.5 8C1.5 10.5 4.5 13 8 13C11.5 13 14.5 10.5 15.5 8C14.5 5.5 11.5 3 8 3ZM8 11.5C6.067 11.5 4.5 9.933 4.5 8C4.5 6.067 6.067 4.5 8 4.5C9.933 4.5 11.5 6.067 11.5 8C11.5 9.933 9.933 11.5 8 11.5Z" 
        fill="currentColor"/>
    </svg>
`;

const eyeClosedSVG = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14.5 7.5L13 9L11.5 7.5L10 9L8.5 7.5L7 9L5.5 7.5L4 9L2.5 7.5L1 9V7L2.5 5.5L4 7L5.5 5.5L7 7L8.5 5.5L10 7L11.5 5.5L13 7L14.5 5.5L16 7V9L14.5 7.5Z" 
        fill="currentColor"/>
    </svg>
`;

function createColorGroup(color) {
    const colorInfo = colorMapping[color];
    if (!colorInfo) return null;

    const isVisible = colorStates.getVisibility(color);

    return `
        <div class="color-group" data-color="${color}" data-visible="${isVisible}">
            <div class="color-indicator ${colorInfo.class}">
                <div class="visibility-toggle" data-color="${color}">
                    ${isVisible ? eyeOpenSVG : eyeClosedSVG}
                </div>
            </div>
        </div>
    `;
}

// 添加设置图层颜色的函数
async function setLayerColor(color) {
    try {
        if (!app.activeDocument) {
            console.log('没有打开的文档');
            return;
        }

        await executeAsModal(async () => {
            try {
                const doc = app.activeDocument;
                const selectedLayers = doc.activeLayers;

                if (!selectedLayers || selectedLayers.length === 0) {
                    console.log('没有选中的图层');
                    return;
                }

                // 准备batchPlay命令
                const command = {
                    _obj: "set",
                    _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
                    to: { _obj: "layer", color: { _enum: "color", _value: color === 'none' ? 'none' : color } },
                    _options: { dialogOptions: "dontDisplay" }
                };

                // 为每个选中的图层设置颜色
                for (const layer of selectedLayers) {
                    try {
                        await batchPlay([command], {
                            synchronousExecution: true,
                            modalBehavior: "execute"
                        });
                        // 更新缓存
                        layerCache.colorMap.set(layer.id, color === 'none' ? null : color);
                    } catch (err) {
                        console.error(`设置图层 "${layer.name}" 颜色时出错:`, err);
                    }
                }
            } catch (err) {
                console.error('设置图层颜色时出错:', err);
            }
        }, { commandName: '设置图层颜色' });
    } catch (err) {
        console.error('执行设置颜色操作时出错:', err);
    }
}

// 修改初始化函数，移除监听器
document.addEventListener('DOMContentLoaded', async () => {
    console.log('插件已加载');
    try {
        // 直接显示所有可用的颜色选项
        await initializeColorGroups();
    } catch (err) {
        console.error('初始化时出错:', err);
    }
});