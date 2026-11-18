export const template: string = `
<main class="manager">
  <header class="heading">
    <div><h2>SSH 代理管理</h2><p>配置代理预设，为分组或单个连接指定线路。</p></div>
    <button class="btn btn-primary" [disabled]="saving || !dirty" (click)="save()">{{ saving ? '保存中…' : '保存更改' }}</button>
  </header>
  <p *ngIf="!runtime.supported" class="notice error">当前 Tabby 版本缺少所需的 SSH 会话入口，线路规则无法应用。</p>
  <p *ngIf="message" class="notice" [class.error]="hasError" role="status">{{ message }}</p>

  <fieldset [disabled]="saving">
    <section class="panel">
      <div class="section-title"><h3>代理预设</h3><button class="action" (click)="addPreset()">＋ 新增预设</button></div>
      <div class="presets">
        <button *ngFor="let p of draft.presets" class="preset" [attr.aria-pressed]="p === editor" (click)="editor = p">
          <span class="indicator"></span>{{ p.name || '未命名' }}
        </button>
      </div>
      <div *ngIf="editor" class="editor">
        <label>名称<input class="form-control" [(ngModel)]="editor.name" (ngModelChange)="changed()" /></label>
        <label>协议<select class="form-control" [(ngModel)]="editor.protocol" (ngModelChange)="changed()"><option value="socks5">SOCKS5</option><option value="http-connect">HTTP CONNECT</option></select></label>
        <label>主机<input class="form-control mono" [(ngModel)]="editor.host" (ngModelChange)="changed()" placeholder="127.0.0.1" /></label>
        <label>端口<input class="form-control mono" inputmode="numeric" [(ngModel)]="editor.port" (ngModelChange)="changed()" /></label>
        <button class="action remove" (click)="removePreset()">移除</button>
      </div>
      <p *ngIf="!editor" class="muted">还没有代理预设。</p>
    </section>

    <section class="panel rules">
      <div class="section-title"><h3>连接线路</h3><span class="muted">{{ count }} 个 SSH 配置</span></div>
      <div *ngFor="let group of groups" class="group">
        <div class="group-head">
          <strong>{{ group.name }}</strong>
          <label>分组线路
            <select class="form-control" [ngModel]="draft.groups[group.key] || ''" (ngModelChange)="setRule(draft.groups, group.key, $event)">
              <option value="">沿用 Tabby</option><option value="direct">直连</option>
              <option *ngFor="let p of draft.presets" [value]="p.id">{{ p.name }}</option>
            </select>
          </label>
        </div>
        <div class="profile" *ngFor="let p of group.profiles" [class.expanded]="active === p">
          <div class="profile-row">
            <button class="profile-name" (click)="inspect(p)" [attr.aria-expanded]="active === p">
              <span class="chevron">{{ active === p ? '▾' : '▸' }}</span>
              <span><strong>{{ p.name }}</strong><small class="mono">{{ p.options?.host }}</small></span>
            </button>
            <select class="form-control" [attr.aria-label]="p.name + ' 的线路'" [ngModel]="draft.profiles[p.id] || ''" (ngModelChange)="setRule(draft.profiles, p.id, $event)">
              <option value="">继承分组</option><option value="direct">直连</option><option value="native">沿用 Tabby</option>
              <option *ngFor="let item of draft.presets" [value]="item.id">{{ item.name }}</option>
            </select>
          </div>
          <div *ngIf="active === p" class="detail">
            <div class="route"><small>{{ previewSource }}</small><strong>{{ previewPath }}</strong></div>
            <div *ngIf="runtime.recent.get(p.id) as last" class="history">
              最近成功连接 · {{ last.time }} · {{ last.source }}<br>{{ last.path }}
            </div>
            <div class="tools">
              <label>本次线路
                <select class="form-control" [(ngModel)]="temporary" (ngModelChange)="refreshPreview()">
                  <option value="">使用上方规则</option><option value="direct">直连</option>
                  <option *ngFor="let item of draft.presets" [value]="item.id">{{ item.name }}</option>
                </select>
              </label>
              <button class="action" [disabled]="testing" (click)="test()">{{ testing ? '测试中…' : '测试连接' }}</button>
              <button class="btn btn-secondary" [disabled]="opening || !runtime.supported" (click)="open()">连接一次 ↗</button>
            </div>
            <div *ngIf="steps.length" class="progress-line" role="status">{{ steps.join(' → ') }}</div>
            <p *ngIf="actionError" class="error" role="alert">{{ actionError }}</p>
          </div>
        </div>
      </div>
      <p *ngIf="!count" class="muted">在 Tabby 添加 SSH 配置后，即可在此指定线路。</p>
    </section>
  </fieldset>
</main>`

export const styles: string = `
:host { display:block; color:inherit; }
.manager { --line:rgba(128,139,151,.30); --tint:rgba(84,141,184,.08); max-width:1020px; margin:0 auto; padding:clamp(14px,3vw,36px); }
.manager * { box-sizing:border-box; }
fieldset { border:0; padding:0; min-width:0; margin:0; }
.heading,.section-title,.group-head,.profile-row,.tools { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.heading { margin-bottom:22px; } h2,h3,p { margin:0; }
h2 { font-size:1.6rem; letter-spacing:.015em; font-weight:650; } h3 { font-size:1.12rem; font-weight:650; }
.heading p,.muted,.history,small { opacity:.76; } .heading p { margin-top:5px; }
.panel { border:1px solid var(--line); border-radius:12px; padding:18px 20px; margin-bottom:16px; }
.section-title { margin-bottom:14px; } .presets { display:flex; flex-wrap:wrap; gap:7px; }
button { cursor:pointer; } button:disabled { cursor:default; }
.action,.preset,.profile-name { color:inherit; background:transparent; font:inherit; }
.action,.preset { border:1px solid var(--line); border-radius:6px; padding:6px 11px; }
.action:hover,.preset:hover,.profile-row:hover { background:var(--tint); }
.preset { display:flex; align-items:center; gap:7px; overflow-wrap:anywhere; }
.preset[aria-pressed=true] { border-color:#568caa; background:var(--tint); font-weight:600; }
.indicator { width:7px; height:7px; border:1px solid currentColor; border-radius:50%; }
.preset[aria-pressed=true] .indicator { background:#559bb7; }
.editor { display:grid; grid-template-columns:1.1fr 1fr 1.4fr .7fr auto; align-items:end; gap:10px; margin-top:16px; }
label { display:block; margin:0; font-size:.88em; } label .form-control { margin-top:4px; }
.form-control { min-width:0; width:100%; } .remove { align-self:end; }
.mono { font-family:var(--bs-font-monospace,monospace); }
.group { border-top:1px solid var(--line); } .group-head { padding:10px 12px; background:var(--tint); }
.group-head label,.tools label { display:flex; align-items:center; gap:8px; }
.group-head select,.tools select { width:auto; max-width:200px; margin:0; }
.profile { border-bottom:1px solid var(--line); } .group .profile:last-child { border:0; }
.profile-row { padding:8px 12px; } .profile-row>select { width:clamp(128px,25%,230px); }
.profile-name { flex:1; min-width:110px; border:0; display:flex; align-items:center; text-align:left; gap:10px; padding:4px 0; }
.profile-name small { display:block; } .profile-name span,.route,.history { overflow-wrap:anywhere; }
.chevron { opacity:.65; } .expanded { background:var(--tint); } .detail { padding:0 14px 14px 32px; }
.route { border-left:3px solid #559bb7; padding-left:10px; } .route small,.route strong { display:block; }
.history,.progress-line { margin-top:10px; font-size:.92em; } .tools { justify-content:flex-start; margin-top:14px; }
.notice { margin:0 0 14px; border-left:3px solid #559bb7; padding:6px 10px; }
.error { border-left:3px solid #c97659; padding-left:9px; margin-top:8px; } :focus-visible { outline:2px solid #589ac1; outline-offset:2px; }
@media (max-width:800px) { .editor { grid-template-columns:repeat(2,minmax(0,1fr)); } .remove { justify-self:start; } }
@media (max-width:520px) { .panel { padding:12px; } .detail { padding-left:10px; } .group-head label,.tools label { flex-wrap:wrap; } }
`
