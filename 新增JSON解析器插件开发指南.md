# Netron 自定义 JSON 解析器插件开发指南

## 概述

本文档详细介绍如何为 Netron 开发一个自定义的 JSON 格式模型解析器插件，以可视化自定义的 AI 模型网络结构。

## 开发流程

### 1. 定义 JSON 模型格式

首先需要明确你的 JSON 模型文件的数据结构。以 CDS 模型为例：

```json
{
  "meta_data": {
    "name": "customjson",
    "inputs": [
      {
        "name": "ifm",
        "shape": [1, 3, 224, 224]
      }
    ],
    "outputs": [
      {
        "name": "ofm",
        "shape": [1, 3, 224, 224]
      }
    ]
  },
  "nodes": [
    {
      "name": "custom_node",
      "type": "CustomType",
      "inputs": ["ifm"],
      "outputs": ["edge_0"],
      "color": "red",  // 自定义属性
      "user_list": [1, 2, 3, 4, 5],
      "name_list": ["a", "b", "c", "d", "e"]
    }
  ],
  "edges": [
    {
      "name": "ifm",
      "shape": [1, 3, 224, 224]
    }
  ]
}
```

**关键字段说明：**
- `meta_data`: 模型元数据，包含模型名称、输入输出定义
  - `inputs`: **数组格式**，每个元素包含 name 和 shape
  - `outputs`: **数组格式**，每个元素包含 name 和 shape
- `nodes`: 计算节点数组，每个节点包含名称、类型、输入输出连接及自定义属性
- `edges`: 数据流边数组，描述张量的形状信息

### 2. 创建插件主文件

在 `source/` 目录下创建插件文件（如 `cdsmodel.js`），实现以下核心类：

#### 2.1 ModelFactory 类

负责识别和加载模型文件：

```javascript
const cdsmodel = {};

cdsmodel.ModelFactory = class {
    async match(context) {
        const identifier = context.identifier;
        const extension = identifier.lastIndexOf('.') > 0
            ? identifier.split('.').pop().toLowerCase()
            : '';

        if (extension === 'json') {
            const obj = await context.peek('json');
            // 检查特征字段来识别你的模型格式
            if (obj && obj.meta_data && obj.nodes && obj.edges) {
                return context.set('cdsmodel', obj);
            }
        }
        return null;
    }

    async open(context) {
        const obj = context.value;
        if (!obj) {
            throw new Error('Model data is undefined');
        }
        return new cdsmodel.Model(obj);
    }
};
```

**关键点：**
- `match()`: 识别文件是否符合你的格式，返回 `context.set()` 表示匹配成功
- `open()`: 从 `context.value` 获取数据并创建 Model 实例
- ⚠️ **注意**: `context` 不支持 `get()` 方法，只能使用 `context.value`

#### 2.2 Model 类

表示整个模型：

```javascript
cdsmodel.Model = class {
    constructor(obj) {
        if (!obj) {
            throw new Error('Model constructor received undefined object');
        }
        this.format = "CDS Model";  // 模型格式名称
        this.producer = obj.meta_data?.name || "";  // 生产者/框架名
        this.modules = [new cdsmodel.Graph(obj)];  // ⚠️ 必须是 modules 不是 graphs
    }
};
```

**关键点：**
- 必须使用 `modules` 属性（不是 `graphs`）
- 所有属性必须是**公共属性**（不能用 `_name` + getter）

#### 2.3 Graph 类

表示计算图：

```javascript
cdsmodel.Graph = class {
    constructor(obj) {
        if (!obj) {
            throw new Error('Graph constructor received undefined object');
        }
        // ⚠️ 直接使用公共属性
        this.name = obj.meta_data?.name || "graph";
        this.inputs = [];   // Argument[]
        this.outputs = [];  // Argument[]
        this.nodes = [];    // Node[]

        // 创建边的映射表
        const edgeMap = new Map();
        if (obj.edges && Array.isArray(obj.edges)) {
            for (const edge of obj.edges) {
                if (edge && edge.name) {
                    edgeMap.set(edge.name, edge);
                }
            }
        }

        // 处理输入 - 支持数组格式
        if (obj.meta_data && obj.meta_data.inputs) {
            const inputs = Array.isArray(obj.meta_data.inputs)
                ? obj.meta_data.inputs
                : [obj.meta_data.inputs];  // 兼容单个对象格式

            for (const input of inputs) {
                const inputName = input.name || "input";
                const edge = edgeMap.get(inputName);
                const shape = input.shape || (edge && edge.shape);
                const type = shape ? new cdsmodel.TensorType(shape) : null;
                const value = new cdsmodel.Value(inputName, type);
                this.inputs.push(new cdsmodel.Argument(inputName, [value]));
            }
        }

        // 处理输出 - 支持数组格式
        if (obj.meta_data && obj.meta_data.outputs) {
            const outputs = Array.isArray(obj.meta_data.outputs)
                ? obj.meta_data.outputs
                : [obj.meta_data.outputs];  // 兼容单个对象格式

            for (const output of outputs) {
                const outputName = output.name || "output";
                const edge = edgeMap.get(outputName);
                const shape = output.shape || (edge && edge.shape);
                const type = shape ? new cdsmodel.TensorType(shape) : null;
                const value = new cdsmodel.Value(outputName, type);
                this.outputs.push(new cdsmodel.Argument(outputName, [value]));
            }
        }

        // 处理节点
        if (obj.nodes && Array.isArray(obj.nodes)) {
            for (const node of obj.nodes) {
                if (node) {
                    this.nodes.push(new cdsmodel.Node(node, edgeMap));
                }
            }
        }
    }
};
```

#### 2.4 Node 类

表示计算节点：

```javascript
cdsmodel.Node = class {
    constructor(obj, edgeMap) {
        if (!obj) {
            throw new Error('Node constructor received undefined object');
        }
        this.name = obj.name || "";
        this.type = { name: obj.type || "Unknown" };  // ⚠️ 必须是对象形式
        this.inputs = [];    // Argument[]
        this.outputs = [];   // Argument[]
        this.attributes = []; // Attribute[]

        // 处理输入
        if (obj.inputs && Array.isArray(obj.inputs)) {
            const values = obj.inputs.map((inputName) => {
                const edge = edgeMap ? edgeMap.get(inputName) : null;
                const type = edge && edge.shape
                    ? new cdsmodel.TensorType(edge.shape)
                    : null;
                return new cdsmodel.Value(inputName, type);
            });
            this.inputs.push(new cdsmodel.Argument("inputs", values));
        }

        // 处理输出（类似）
        // ...

        // 处理自定义属性（如 color）
        if (obj && typeof obj === 'object') {
            for (const [key, value] of Object.entries(obj)) {
                if (key !== "name" && key !== "type" &&
                    key !== "inputs" && key !== "outputs") {
                    this.attributes.push(new cdsmodel.Attribute(key, value));
                }
            }
        }
    }
};
```

#### 2.5 辅助类

```javascript
// 属性类
cdsmodel.Attribute = class {
    constructor(name, value) {
        this.name = name;
        this.value = value;
    }
};

// 值类（表示张量）
cdsmodel.Value = class {
    constructor(name, type) {
        this.name = name;
        this.type = type || null;
    }
};

// 参数类（包含多个值）
cdsmodel.Argument = class {
    constructor(name, value) {
        this.name = name;
        this.value = value || [];  // Value[]
    }
};

// 张量类型
cdsmodel.TensorType = class {
    constructor(shape) {
        this.shape = new cdsmodel.TensorShape(shape);
    }

    toString() {
        return this.shape.toString();
    }
};

// 张量形状
cdsmodel.TensorShape = class {
    constructor(dimensions) {
        this.dimensions = dimensions || [];
    }

    toString() {
        if (this.dimensions && Array.isArray(this.dimensions)) {
            return `[${this.dimensions.join(",")}]`;
        }
        return "";
    }
};

// ⚠️ 最后必须导出 ModelFactory
export const ModelFactory = cdsmodel.ModelFactory;
```

### 3. 注册插件

在 `source/view.js` 中注册你的插件：

找到类似这样的代码段：

```javascript
this.register('./transformers', ['.json']);
this.register('./customjson', ['.json']);
```

在合适的位置添加：

```javascript
this.register('./cdsmodel', ['.json']);
```

**注意事项：**
- 插件路径使用相对路径 `'./插件名'`
- 扩展名数组 `['.json']` 指定支持的文件扩展名
- 多个插件支持同一扩展名时，按注册顺序匹配

### 4. 测试插件

#### 4.1 启动开发服务器

```bash
cd /path/to/netron
python3 -m http.server 8088
```

#### 4.2 在浏览器中测试

1. 打开 http://localhost:8088/source/index.html
2. 打开开发者工具（F12 或 Cmd+Option+I）
3. 拖入或选择你的 JSON 模型文件
4. 查看控制台日志和可视化结果

#### 4.3 添加调试日志

在开发阶段可以添加 `console.log()` 来追踪执行流程：

```javascript
async open(context) {
    console.log('[CDS] open() called');
    const obj = context.value;
    console.log('[CDS] context.value:', obj);
    // ...
}
```

**注意**: ESLint 会警告 `no-console`，但不影响运行。

## 重要注意事项

### ⚠️ 必须遵守的规则

1. **属性命名规范**
   - Model 类必须使用 `modules` 属性（不是 `graphs`）
   - 所有类的属性必须是公共属性（直接 `this.name = ...`）
   - 不要使用私有属性 + getter 模式（`this._name` + `get name()`）

2. **类型结构**
   - Node 的 `type` 必须是对象：`{ name: "TypeName" }`
   - Graph/Node 的 `inputs/outputs` 是 `Argument[]`
   - Argument 包含 `value` 数组：`{ name, value: Value[] }`
   - Value 包含 `name` 和 `type`：`{ name, type: TensorType }`
   - **meta_data 的 inputs/outputs 支持数组和单对象两种格式**

3. **Context API 限制**
   - ✅ 可用：`context.value`, `context.peek()`, `context.set()`
   - ❌ 不可用：`context.get()`

4. **数组操作安全**
   - 在使用 `.map()` 前必须校验数组是否存在
   - 示例：`if (obj.nodes && Array.isArray(obj.nodes)) { ... }`

5. **导出规范**
   - 文件末尾必须导出 ModelFactory：
     ```javascript
     export const ModelFactory = cdsmodel.ModelFactory;
     ```

### 常见问题及解决方案

#### 问题 1: 页面空白，无任何显示

**可能原因：**
- Model 使用了 `graphs` 而不是 `modules`
- 使用了私有属性 + getter 而不是公共属性

**解决方案：**
```javascript
// ❌ 错误
this._modules = [...];
get modules() { return this._modules; }

// ✅ 正确
this.modules = [...];
```

#### 问题 2: Cannot read properties of undefined (reading 'map')

**可能原因：**
- 没有校验数组是否存在就调用 `.map()`
- 某个对象是 undefined

**解决方案：**
```javascript
// ❌ 错误
const values = obj.inputs.map(...);

// ✅ 正确
if (obj.inputs && Array.isArray(obj.inputs)) {
    const values = obj.inputs.map(...);
}
```

#### 问题 3: 插件不被识别

**可能原因：**
- 没有在 `view.js` 中注册插件
- `match()` 方法的条件判断不正确
- 没有正确导出 `ModelFactory`

**解决方案：**
1. 检查 `view.js` 是否有 `this.register('./yourplugin', ['.json'])`
2. 在 `match()` 中添加日志查看是否被调用
3. 确保文件末尾有 `export const ModelFactory = ...`

#### 问题 4: 自定义属性不显示

**解决方案：**
确保在 Node 构造函数中遍历所有非标准字段：

```javascript
for (const [key, value] of Object.entries(obj)) {
    if (key !== "name" && key !== "type" &&
        key !== "inputs" && key !== "outputs") {
        this.attributes.push(new cdsmodel.Attribute(key, value));
    }
}
```

## 完整示例

完整的插件代码参见：`source/cdsmodel.js`

示例模型文件参见：`cds_model_struct.json`

## 扩展功能

### 添加元数据支持

可以创建 `cdsmodel-metadata.json` 来定义操作符的元数据：

```json
[
  {
    "name": "CustomType",
    "category": "Layer",
    "inputs": [
      { "name": "input" }
    ],
    "outputs": [
      { "name": "output" }
    ],
    "attributes": [
      { "name": "color", "type": "string" }
    ]
  }
]
```

在 `open()` 方法中加载：

```javascript
async open(context) {
    const metadata = await context.metadata('cdsmodel-metadata.json');
    // ...
}
```

## 调试技巧

1. **使用浏览器开发者工具**
   - Console 标签查看日志和错误
   - Network 标签查看文件加载情况
   - Sources 标签设置断点调试

2. **添加防御性检查**
   ```javascript
   if (!obj) {
       throw new Error('Object is undefined');
   }
   ```

3. **逐步验证数据结构**
   ```javascript
   console.log('obj.nodes:', obj?.nodes);
   console.log('obj.edges:', obj?.edges);
   ```

## 总结

开发 Netron 插件的核心步骤：

1. ✅ 定义 JSON 格式
2. ✅ 创建插件文件（实现 ModelFactory、Model、Graph、Node 等类）
3. ✅ 在 view.js 中注册插件
4. ✅ 使用浏览器测试
5. ✅ 处理边界情况和错误

遵循本文档的规范和注意事项，可以快速开发出稳定可靠的 Netron 插件。

---

**日期**: 2025-12-10
**版本**: 1.0
