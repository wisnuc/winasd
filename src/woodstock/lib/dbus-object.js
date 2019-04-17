const path = require('path')
const EventEmitter = require('events')

/**
DBusObject has the following built-in properties

1. dbus, root object has _dbus; non-root object retrieve this property from parent
2. name, optional, but non-root object should have a proper name when attached to dbus object tree.
3. parent & children[], maintaining tree structure
4. ifaces[], interfaces implemented by this object
*/
class DBusObject extends EventEmitter {
  constructor (name) {
    super ()

    Object.defineProperty(this, 'dbus', {
      configurable: true, // allowing redefine
      get () {
        return  this.parent ? this.parent.dbus : null
      }
    })
   
    this.name = name || ''
    this.ifaces = []
    this.children = []
  }

  visit (f) {
    f(this)
    this.children.forEach(c => c.visit(f))
  }

  find (f) {
    if (f(this)) return this
    return this.children.find(c => find(f))
  }

  objectPath () {
    let arr = []
    for (let o = this; o.parent; o = o.parent) {
      arr.unshift(o.name)
    }
    return path.join('/', ...arr)
  }

  // empty array is OK
  route (namepath, make) {
    if (namepath.length === 0) return this
    let child = this.children.find(c => c.name === namepath[0])
    if (!child) {
      if (!make) return
      child = new DBusObject(namepath[0])
      this.addChild(child)
    }
    return child.route(namepath.slice(1), make)
  } 

  // add an interface (object) to this object
  addInterface(iface) {
    // late binding and avoid cyclic, aka, weak 
    Object.defineProperty(iface, 'dobj', { get: () => this })
    Object.defineProperty(iface, 'dbus', { get: () => this.dbus })
    this.ifaces.push(iface)
    return this
  }

  removeInterface(iface) {
    let index = this.ifaces.findIndex(x => x == iface)
    if (index !== -1) this.ifaces.splice(index, 1)
    return this
  }

  // add an dbus object as a child
  addChild (child) {
    child.attach(this)
    return this
  }

  // create a dbus object, add it as a child and return the child object
  createChild (name) {
    let child = new DBusObject(name)
    child.attach(this)
    return child
  }

  attach (parent) {
    if (parent) {
      this.parent = parent
      parent.children.push(this)
      if (this.dbus) {
        const f = node => node.mounted()
        this.visit(f)
      }  
    }
  }

  detach () {
    if (this.parent) {
    }
  }

  // this is an event handler
  mounted () {
    //console.log(this.objectPath() + ' mounted')
  } 
}

module.exports = DBusObject 
