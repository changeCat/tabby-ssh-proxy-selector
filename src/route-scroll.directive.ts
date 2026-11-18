import { Directive, ElementRef, Inject, NgZone } from '@angular/core'

@Directive({ selector: '[proxyRouteScroll]', standalone: false })
export class RouteScrollDirective {
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

        // Consume each wheel delta once, including a gesture crossing either edge.
        for (let pane: HTMLElement | null = list; pane && remaining; pane = pane.parentElement) {
            const limit = pane.scrollHeight - pane.clientHeight
            if (limit <= 0 || (pane !== list && pane !== pane.ownerDocument.scrollingElement &&
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
