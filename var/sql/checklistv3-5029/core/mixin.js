function applyObjectMixin(mixin, instance) {
  Object.entries(mixin).forEach(([key, value]) => {
    if (typeof value === "function" && !instance[key]) {
      instance[key] = value.bind(instance);
    }
  });
}

function mix(instance) {
  return {
    with: (...mixins) => {
      mixins.forEach((mixin) => {
        if (typeof mixin === "function") {
          const name = mixin.name;
          if (!name) {
            throw new Error("Function mixins must be named.");
          }
          instance[name] = mixin.bind(instance);
        } else if (Array.isArray(mixin) && mixin.length > 1) {
          const [mixinCb, ...params] = mixin;
          applyObjectMixin(mixinCb(...params), instance);
        } else if (typeof mixin === "object" && mixin !== null) {
          applyObjectMixin(mixin, instance);
        }
      });
      return instance;
    },
  };
}

module.exports = mix;
