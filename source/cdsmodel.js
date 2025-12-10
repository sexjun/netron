const cdsmodel = {};

cdsmodel.ModelFactory = class {
  async match(context) {
    const identifier = context.identifier;
    const extension =
      identifier.lastIndexOf(".") > 0
        ? identifier.split(".").pop().toLowerCase()
        : "";

    if (extension === "json") {
      const obj = await context.peek("json");
      // 检查是否是 CDS 模型格式
      if (obj && obj.meta_data && obj.nodes && obj.edges) {
        return context.set("cdsmodel", obj);
      }
    }
    return null;
  }

  async open(context) {
    console.log("[CDS] open() called");
    const obj = context.value;
    console.log("[CDS] context.value:", obj);
    if (!obj) {
      throw new Error("CDS Model data is undefined");
    }
    console.log("[CDS] Creating Model...");
    const model = new cdsmodel.Model(obj);
    console.log("[CDS] Model created:", model);
    return model;
  }
};

cdsmodel.Model = class {
  constructor(obj) {
    console.log("[CDS] Model constructor, obj:", obj);
    if (!obj) {
      throw new Error("Model constructor received undefined object");
    }
    this.format = "CDS Model";
    this.producer = obj.meta_data?.name || "";
    console.log("[CDS] Creating modules...");
    this.modules = [new cdsmodel.Graph(obj)];
    console.log("[CDS] Model created successfully");
  }
};

cdsmodel.Graph = class {
  constructor(obj) {
    console.log("[CDS] Graph constructor, obj:", obj);
    console.log("[CDS] obj.nodes:", obj?.nodes);
    console.log("[CDS] obj.edges:", obj?.edges);
    if (!obj) {
      throw new Error("Graph constructor received undefined object");
    }
    this.name = obj.meta_data?.name || "graph";
    this.inputs = [];
    this.outputs = [];
    this.nodes = [];

    // 创建边的映射表
    const edgeMap = new Map();
    if (obj.edges && Array.isArray(obj.edges)) {
      console.log("[CDS] Creating edge map, edges count:", obj.edges.length);
      for (const edge of obj.edges) {
        if (edge && edge.name) {
          edgeMap.set(edge.name, edge);
        }
      }
    }

    // 处理输入
    if (obj.meta_data && obj.meta_data.inputs) {
      console.log("[CDS] Processing inputs");
      const inputs = Array.isArray(obj.meta_data.inputs)
        ? obj.meta_data.inputs
        : [obj.meta_data.inputs];

      for (const input of inputs) {
        const inputName = input.name || "input";
        const edge = edgeMap.get(inputName);
        const shape = input.shape || (edge && edge.shape);
        const type = shape ? new cdsmodel.TensorType(shape) : null;
        const value = new cdsmodel.Value(inputName, type);
        this.inputs.push(new cdsmodel.Argument(inputName, [value]));
      }
    }

    // 处理输出
    if (obj.meta_data && obj.meta_data.outputs) {
      console.log("[CDS] Processing outputs");
      const outputs = Array.isArray(obj.meta_data.outputs)
        ? obj.meta_data.outputs
        : [obj.meta_data.outputs];

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
      console.log("[CDS] Processing nodes, count:", obj.nodes.length);
      for (const node of obj.nodes) {
        if (node) {
          console.log("[CDS] Creating node:", node.name);
          this.nodes.push(new cdsmodel.Node(node, edgeMap));
        }
      }
    }
    console.log("[CDS] Graph created, nodes:", this.nodes.length);
  }
};

cdsmodel.Node = class {
  constructor(obj, edgeMap) {
    if (!obj) {
      throw new Error("Node constructor received undefined object");
    }
    this.name = obj.name || "";
    this.type = { name: obj.type || "Unknown" };
    this.inputs = [];
    this.outputs = [];
    this.attributes = [];

    // 处理输入
    if (obj.inputs && Array.isArray(obj.inputs)) {
      const values = obj.inputs.map((inputName) => {
        const edge = edgeMap ? edgeMap.get(inputName) : null;
        const type =
          edge && edge.shape ? new cdsmodel.TensorType(edge.shape) : null;
        return new cdsmodel.Value(inputName, type);
      });
      this.inputs.push(new cdsmodel.Argument("inputs", values));
    }

    // 处理输出
    if (obj.outputs && Array.isArray(obj.outputs)) {
      const values = obj.outputs.map((outputName) => {
        const edge = edgeMap ? edgeMap.get(outputName) : null;
        const type =
          edge && edge.shape ? new cdsmodel.TensorType(edge.shape) : null;
        return new cdsmodel.Value(outputName, type);
      });
      this.outputs.push(new cdsmodel.Argument("outputs", values));
    }

    // 处理其他属性
    if (obj && typeof obj === "object") {
      for (const [key, value] of Object.entries(obj)) {
        if (
          key !== "name" &&
          key !== "type" &&
          key !== "inputs" &&
          key !== "outputs"
        ) {
          this.attributes.push(new cdsmodel.Attribute(key, value));
        }
      }
    }
  }
};

cdsmodel.Attribute = class {
  constructor(name, value) {
    this.name = name;
    this.value = value;
  }
};

cdsmodel.Value = class {
  constructor(name, type) {
    this.name = name;
    this.type = type || null;
  }
};

cdsmodel.Argument = class {
  constructor(name, value) {
    this.name = name;
    this.value = value || [];
  }
};

cdsmodel.TensorType = class {
  constructor(shape) {
    this.shape = new cdsmodel.TensorShape(shape);
  }

  toString() {
    return this.shape.toString();
  }
};

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

export const ModelFactory = cdsmodel.ModelFactory;
