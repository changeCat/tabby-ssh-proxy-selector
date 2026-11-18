import { Directive, ElementRef, Inject, NgZone } from '@angular/core'

// Wheel events have no gesture-end flag. A quiet interval separates a new
// scroll from the momentum of the one that brought the list to its edge.
const gestureGapMs = 140

@Directive({ selector: '[proxyRouteScroll]', standalone: false })
export class RouteScrollDirective {
    private edgeDirection = 0
    private holdUntil = 0

    constructor (@Inject(ElementRef) private element: ElementRef<HTMLElement>, @Inject(NgZone) zone: NgZone) {
        zone.runOutsideAngular(() => element.nativeElement.addEventListener('wheel', this.onWheel, { capture: true, passive: false }))
    }

    ngOnDestroy (): void {
        this.element.nativeElement.removeEventListener('wheel', this.onWheel, true)
    }

    private readonly onWheel = (event: WheelEvent): void => {
        if (!event.cancelable || event.defaultPrevented || event.ctrlKey || event.shiftKey ||
            !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) { return }
        const list = this.element.nativeElement
        let remaining = event.deltaY
        if (event.deltaMode === 1) { remaining *= parseFloat(getComputedStyle(list).lineHeight) || 16 }
        if (event.deltaMode === 2) { remaining *= list.clientHeight }

        const direction = Math.sign(remaining)
        const limit = list.scrollHeight - list.clientHeight
        const edge = direction > 0 ? limit : 0
        // scrollTop can be fractional even though scrollHeight and clientHeight are integers.
        if (limit > 0 && Math.abs(edge - list.scrollTop) >= 1) {
            event.preventDefault()
            list.scrollTop = Math.max(0, Math.min(limit, list.scrollTop + remaining))
            this.edgeDirection = Math.abs(edge - list.scrollTop) < 1 ? direction : 0
            this.holdUntil = event.timeStamp + gestureGapMs
            return
        }
        if (limit > 0 && this.edgeDirection === direction && event.timeStamp < this.holdUntil) {
            event.preventDefault()
            this.holdUntil = event.timeStamp + gestureGapMs
            return
        }
        this.edgeDirection = 0

        for (let pane = list.parentElement; pane && remaining; pane = pane.parentElement) {
            const limit = pane.scrollHeight - pane.clientHeight
            if (limit <= 0 || (pane !== pane.ownerDocument.scrollingElement &&
                !/^(auto|scroll|overlay)$/.test(getComputedStyle(pane).overflowY))) { continue }
            const top = pane.scrollTop
            const next = Math.max(0, Math.min(limit, top + remaining))
            if (next === top) { continue }
            event.preventDefault()
            pane.scrollTop = next
            remaining -= next - top
        }
    }
}
