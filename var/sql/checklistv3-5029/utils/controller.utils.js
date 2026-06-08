function logClassMethods(obj) {
  let props = new Set();
  let currentObj = obj;

  do {
    Object.getOwnPropertyNames(currentObj).forEach(prop => {
      if (typeof obj[prop] === 'function') {
        props.add(prop);
      }
    });
  } while ((currentObj = Object.getPrototypeOf(currentObj)) && currentObj !== Object.prototype);

  console.log(`Methods of ${obj.constructor.name}:`);
  props.forEach(method => console.log(`- ${method}`));
}


module.exports = {
  logClassMethods
};