const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

function loadDirective () {
    const load = Module._load
    try {
        Module._load = function (name, ...args) {
            if (name === '@angular/core') { return { Directive: () => target => target, Inject: () => () => {} } }
            return load.call(this, name, ...args)
        }
        return require('../dist/route-scroll.directive').RouteScrollDirective
    } finally { Module._load = load }
}

for (const direction of [-1, 1]) {
    test(`route list pauses at the ${direction > 0 ? 'bottom' : 'top'} until the next gesture`, () => {
        const outer = { clientHeight: 100, scrollHeight: 500, scrollTop: 200 }
        outer.ownerDocument = { scrollingElement: outer }
        const edge = direction > 0 ? 200 : 0
        let listener
        const list = {
            parentElement: outer, clientHeight: 100, scrollHeight: 300, scrollTop: edge - direction * 20,
            addEventListener: (_, handler) => { listener = handler },
        }
        const Directive = loadDirective()
        new Directive({ nativeElement: list }, { runOutsideAngular: run => run() })
        function wheel (delta, timeStamp) {
            listener({ deltaY: delta, deltaX: 0, timeStamp, cancelable: true, preventDefault () {} })
        }
        wheel(direction * 60, 0)
        assert.equal(list.scrollTop, edge)
        // Continuous momentum lasting longer than the idle threshold is still one gesture.
        for (const time of [50, 110, 180, 250]) { wheel(direction * 15, time) }
        assert.equal(outer.scrollTop, 200)
        wheel(direction * 30, 500)
        assert.equal(outer.scrollTop, 200 + direction * 30)
        wheel(-direction * 25, 510)
        assert.equal(list.scrollTop, edge - direction * 25)
        wheel(direction * 25, 520)
        wheel(-direction * 10, 530)
        assert.equal(list.scrollTop, edge - direction * 10)
        assert.equal(outer.scrollTop, 200 + direction * 30)
    })
}
