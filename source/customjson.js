const customjson = {};

customjson.ModelFactory = class {
    async match(context) {
        // 检查文件扩展名
        const identifier = context.identifier;
        const extension =
            identifier.lastIndexOf(".") > 0
                ? identifier.split(".").pop().toLowerCase()
                : "";

        // 如果是 .json 文件，尝试解析 , 这个方法会检查文件内容是否为有效的 JSON 格式
        // 满足条件就会进入到我们的代码里
        if (extension === "json") {
            const obj = await context.peek("json");
            // 检查是否包含自定义模型的特征字段
            // 你需要根据你的JSON格式修改这些判断条件
            if (
                (obj && obj.model_type === "custom") ||
                (obj && obj.graph && obj.graph.nodes && obj.graph.layers)
            ) {
                return context.set("customjson", obj);
            }
        }
        return null;
    }

    async open(context) {
        // 加载元数据（可选）
        // const metadata = await context.metadata('customjson-metadata.json');
        const obj = context.value;
        return new customjson.Model(obj);
    }
};

customjson.Model = class {
    constructor(obj) {
        // 设置模型格式名称
        this.format = "Custom JSON";
        if (obj.version) {
            this.format += ` v${obj.version}`;
        }

        // 设置模型其他属性
        this.name = obj.name || "";
        this.producer = obj.producer || "";
        this.description = obj.description || "";

        // 创建图结构
        this.modules = [new customjson.Graph(obj)];
    }
};

customjson.Graph = class {
    constructor(obj) {
        this.name = obj.name || "";
        this.inputs = [];
        this.outputs = [];
        this.nodes = [];

        // 解析图结构
        // 这里需要根据你的JSON格式进行调整
        const graph = obj.graph || obj;

        // 解析输入
        if (graph.inputs) {
            this.inputs = graph.inputs.map((input) => {
                const args = [new customjson.Value(input.name, input.type, null)];
                return new customjson.Argument(input.name, args);
            });
        }

        // 解析输出
        if (graph.outputs) {
            this.outputs = graph.outputs.map((output) => {
                const args = [new customjson.Value(output.name, output.type, null)];
                return new customjson.Argument(output.name, args);
            });
        }

        // 解析节点/层
        const nodes = graph.nodes || graph.layers || [];
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            this.nodes.push(new customjson.Node(node, i));
        }
    }
};

customjson.Node = class {
    constructor(node, index) {
        // 节点名称
        this.name = node.name || `node_${index}`;

        // 节点类型/操作类型
        this.type = {
            name: node.type || node.op_type || node.layer_type || "Unknown",
        };

        // 解析输入
        this.inputs = [];
        if (node.inputs) {
            if (Array.isArray(node.inputs)) {
                for (const input of node.inputs) {
                    const name = typeof input === "string" ? input : input.name;
                    const args = [new customjson.Value(name, null, null)];
                    this.inputs.push(new customjson.Argument(name, args));
                }
            }
        }

        // 解析输出
        this.outputs = [];
        if (node.outputs) {
            if (Array.isArray(node.outputs)) {
                for (const output of node.outputs) {
                    const name = typeof output === "string" ? output : output.name;
                    const args = [new customjson.Value(name, null, null)];
                    this.outputs.push(new customjson.Argument(name, args));
                }
            }
        }

        // 解析参数/属性
        this.attributes = [];
        if (node.params || node.attributes || node.config) {
            const params = node.params || node.attributes || node.config;
            for (const [key, value] of Object.entries(params)) {
                this.attributes.push(new customjson.Argument(key, value, null, true));
            }
        }

        // 解析权重
        this.inputs = this.inputs || [];
        if (node.weights) {
            for (const [key, value] of Object.entries(node.weights)) {
                const tensor = new customjson.Tensor(key, value);
                const args = [new customjson.Value(key, tensor.type, tensor)];
                this.inputs.push(new customjson.Argument(key, args, null, true));
            }
        }
    }
};

customjson.Argument = class {
    constructor(name, value, type, visible) {
        this.name = name;
        this.value = value;
        this.type = type || null;
        this.visible = visible !== false;
    }
};

customjson.Value = class {
    constructor(name, type, initializer) {
        this.name = name || "";
        this.type = type || null;
        this.initializer = initializer || null;
    }
};

customjson.Tensor = class {
    constructor(name, data) {
        this.name = name;

        // 根据数据推断类型和形状
        if (Array.isArray(data)) {
            this.type = new customjson.TensorType(
                "float32",
                new customjson.TensorShape([data.length])
            );
            this.encoding = "<";
            this.values = data;
        } else if (data && typeof data === "object") {
            const shape = data.shape || [];
            const dtype = data.dtype || "float32";
            this.type = new customjson.TensorType(
                dtype,
                new customjson.TensorShape(shape)
            );
            this.values = data.values || data.data || [];
        }
    }
};

customjson.TensorType = class {
    constructor(dataType, shape) {
        this.dataType = dataType || "float32";
        this.shape = shape;
    }

    toString() {
        return this.dataType + this.shape.toString();
    }
};

customjson.TensorShape = class {
    constructor(dimensions) {
        this.dimensions = dimensions || [];
    }

    toString() {
        if (this.dimensions && this.dimensions.length > 0) {
            return `[${this.dimensions.join(",")}]`;
        }
        return "";
    }
};

customjson.Error = class extends Error {
    constructor(message) {
        super(message);
        this.name = "Error loading Custom JSON model.";
    }
};

export const ModelFactory = customjson.ModelFactory;
