function printRoutes(router) {
  console.log("Registered Routes:");
  router.stack
    .filter(layer => layer.route)
    .forEach(layer => {
      const route = layer.route;
      const methods = Object.keys(route.methods).join(', ').toUpperCase();
      console.log(`${methods} ${route.path}`);
    });
}

module.exports = {
    printRoutes
};