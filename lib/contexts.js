exports.ContextMeta = ContextMeta;
exports.Context = Context;

function noop() {}

// TODO:
// Implement removeItemContext

function ContextMeta() {
  this.addBinding = noop;
  this.removeBinding = noop;
  this.removeNode = noop;
  this.addItemContext = noop;
  this.removeItemContext = noop;
  this.views = null;
  this.idNamespace = '';
  this.idCount = 0;
  this.pending = [];
  this.pauseCount = 0;
}

function Context(meta, controller, parent, unbound, expression, item, view, attributes, hooks, initHooks) {
  // Required properties //

  // Properties which are globally inherited for the entire page
  this.meta = meta;
  // The page or component. Must have a `model` property with a `data` property
  this.controller = controller;

  // Optional properties //

  // Containing context
  this.parent = parent;
  // Boolean set to true when bindings should be ignored
  this.unbound = unbound;
  // The expression for a block
  this.expression = expression;
  // Alias name for the given expression
  this.alias = expression && expression.meta && expression.meta.as;
  // Alias name for the index or iterated key
  this.keyAlias = expression && expression.meta && expression.meta.keyAs;

  // For Context::eachChild
  // The index of the each at render time
  this.item = item;

  // For Context::viewChild
  // Reference to the current view
  this.view = view;
  // Attribute values passed to the view instance
  this.attributes = attributes;
  // MarkupHooks to be called after insert into DOM of component
  this.hooks = hooks;
  // MarkupHooks to be called immediately before init of component
  this.initHooks = initHooks;

  // Used in EventModel
  this._id = null;
}

Context.prototype.id = function() {
  var count = ++this.meta.idCount;
  return this.meta.idNamespace + '_' + count.toString(36);
};

Context.prototype.addBinding = function(binding) {
  // Don't add bindings that wrap list items. Only their outer range is needed
  if (binding.itemFor) return;
  var expression = binding.template.expression;
  // Don't rerender in unbound sections
  if (expression ? expression.isUnbound(this) : this.unbound) return;
  // Don't rerender to changes in a with expression
  if (expression && expression.meta && expression.meta.blockType === 'with') return;
  this.meta.addBinding(binding);
};
Context.prototype.removeBinding = function(binding) {
  this.meta.removeBinding(binding);
};
Context.prototype.removeNode = function(node) {
  this.meta.removeNode(node);
};

Context.prototype.child = function(expression) {
  // Set or inherit the binding mode
  var blockType = expression.meta && expression.meta.blockType;
  var unbound = (blockType === 'unbound') ? true :
    (blockType === 'bound') ? false :
    this.unbound;
  return new Context(this.meta, this.controller, this, unbound, expression);
};

Context.prototype.componentChild = function(component) {
  return new Context(this.meta, component, this, this.unbound);
};

// Make a context for an item in an each block
Context.prototype.eachChild = function(expression, index) {
  var context = new Context(this.meta, this.controller, this, this.unbound, expression, index);
  this.meta.addItemContext(context);
  return context;
};

Context.prototype.viewChild = function(view, attributes, hooks, initHooks) {
  var context;
  var controller = this.controller;
  var outerScope = view.options && 'outerscope' in view.options;
  if (outerScope) {
    context = controller.context;
    while (context.controller === controller) context = context.parent;
    controller = context.controller;
  }
  if (attributes && 'origscope' in attributes) {
    context = this;
    do {
      if (context.originalController) {
        controller = context.originalController;
        break;
      }
    } while (context = context.parent);
  }
  var result = new Context(this.meta, controller, this, this.unbound, null, null, view, attributes, hooks, initHooks);
  if (outerScope) {
    result.originalController = this.controller;
  }
  return result;
};

Context.prototype.forRelative = function(expression) {
  var context = this;
  while (context && context.expression === expression || context.view) {
    context = context.parent;
  }
  return context;
};

// Returns the closest context which defined the named alias
Context.prototype.forAlias = function(alias) {
  var context = this;
  while (context) {
    if (context.alias === alias || context.keyAlias === alias) return context;
    context = context.parent;
  }
};

// Returns the closest containing context for a view attribute name or nothing
Context.prototype.forAttribute = function(attribute) {
  var context = this;
  while (context) {
    // Find the closest context associated with a view
    if (context.view) {
      var attributes = context.attributes;
      if (!attributes) return;
      if (attributes.hasOwnProperty(attribute)) return context;
      // If the attribute isn't found, but the attributes inherit, continue
      // looking in the next closest view context
      if (!attributes.inherit && !attributes.extend) return;
    }
    context = context.parent;
  }
};

Context.prototype.forViewParent = function() {
  var context = this;
  while (context) {
    // Find the closest view
    if (context.view) return context.parent;
    context = context.parent;
  }
};

Context.prototype.getView = function() {
  var context = this;
  while (context) {
    // Find the closest view
    if (context.view) return context.view;
    context = context.parent;
  }
};

// Returns the `this` value for a context
Context.prototype.get = function() {
  return (this.expression) ? this.expression.get(this) : this.controller.model.data;
};

Context.prototype.pause = function() {
  this.meta.pauseCount++;
};

Context.prototype.unpause = function() {
  if (--this.meta.pauseCount) return;
  this.flush();
};

Context.prototype.flush = function() {
  var pending = this.meta.pending;
  var len = pending.length;
  if (!len) return;
  this.meta.pending = [];
  for (var i = 0; i < len; i++) {
    pending[i]();
  }
};

Context.prototype.queue = function(cb) {
  this.meta.pending.push(cb);
};
