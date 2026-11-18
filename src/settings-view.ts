function routeOptions (choice: string): string {
    return `
    <option value="direct" [selected]="(${choice}) === 'direct'">不使用代理</option>
    <option value="native" [selected]="(${choice}) === 'native'">按 SSH 配置连接</option>
    <option *ngFor="let preset of draft.presets; trackBy: presetId" [value]="preset.id"
      [selected]="(${choice}) === preset.id">{{ preset.name }}</option>`
}

export const template: string = `
<main class="manager">
  <header class="heading">
    <div><h2>SSH 代理管理</h2><p>配置代理预设，为分组或单个连接指定线路。</p></div>
    <button class="btn btn-primary" [disabled]="saving || !dirty" (click)="save()">{{ saving ? '保存中…' : '保存更改' }}</button>
  </header>
  <p *ngIf="!runtime.supported" class="notice error">当前 Tabby 版本缺少所需的 SSH 会话入口，线路规则无法应用。</p>
  <p *ngIf="message" class="notice" [class.error]="hasError" role="status">{{ message }}</p>

  <fieldset [disabled]="saving">
    <section class="panel preset-panel">
      <div class="section-title preset-heading">
        <h3>代理预设</h3>
        <button class="action add-preset" (click)="addPreset()">＋ 新增预设</button>
      </div>
      <div *ngFor="let p of draft.presets; trackBy: presetId" class="preset-row" [class.editing]="editor === p">
        <button type="button" class="preset-summary" [attr.aria-expanded]="editor === p"
          [attr.aria-controls]="editor === p ? 'ssh-proxy-editor-' + p.id : null" (click)="editor = editor === p ? undefined : p">
          <span class="chevron" aria-hidden="true">{{ editor === p ? '▾' : '▸' }}</span>
          <strong [title]="p.name">{{ p.name || '未命名' }}</strong>
          <small>{{ p.protocol === 'socks5' ? 'SOCKS5' : 'HTTP CONNECT' }}</small>
          <small class="mono" [title]="p.host && p.port ? endpointLabel(p) : ''">{{ p.host && p.port ? endpointLabel(p) : '—' }}</small>
        </button>
        <div *ngIf="editor === p" class="editor" [id]="'ssh-proxy-editor-' + p.id">
          <label>名称<input class="form-control" [(ngModel)]="p.name" (ngModelChange)="changed()" /></label>
          <label>协议<select class="form-control" [(ngModel)]="p.protocol" (ngModelChange)="changed()"><option value="socks5">SOCKS5</option><option value="http-connect">HTTP CONNECT</option></select></label>
          <label>主机<input class="form-control mono" [(ngModel)]="p.host" (ngModelChange)="changed()" placeholder="127.0.0.1" /></label>
          <label>端口<input class="form-control mono" inputmode="numeric" [(ngModel)]="p.port" (ngModelChange)="changed()" /></label>
          <div class="preset-actions">
            <label class="auth-toggle"><input type="checkbox" #authToggle [checked]="usesAuthentication(p)"
              (change)="p.authEnabled = authToggle.checked; changed()"><span>使用代理认证</span></label>
            <button class="action remove" type="button" (click)="removePreset()">移除</button>
          </div>
          <div *ngIf="usesAuthentication(p)" class="credentials" role="group" aria-label="代理认证">
            <input class="form-control auth-user" aria-label="代理用户名" placeholder="用户名" [(ngModel)]="p.username" (ngModelChange)="changed()" autocomplete="off" />
            <input class="form-control auth-password" aria-label="代理密码" type="password" [(ngModel)]="passwordEdits[p.id]" (ngModelChange)="changed()"
              [placeholder]="p.encryptedPassword ? '已保存，留空保留' : '密码'" autocomplete="new-password" />
            <button *ngIf="p.username || p.encryptedPassword || passwordEdits[p.id]" class="action auth-clear" type="button" (click)="clearAuthentication(p)">清除凭据</button>
          </div>
        </div>
      </div>
      <p *ngIf="!draft.presets.length" class="muted">还没有代理预设。</p>
    </section>

    <section class="panel rules">
      <div class="section-title"><h3 id="route-list-title">连接线路</h3><span class="muted">{{ count }} 个 SSH 配置</span></div>
      <p *ngIf="count" class="route-help muted">「按 SSH 配置连接」使用每台机器在 Tabby 中设置的连接方式，例如直连、代理或跳板。</p>
      <div *ngIf="count" proxyRouteScroll class="route-list" role="region" aria-labelledby="route-list-title" tabindex="0">
        <div *ngFor="let group of groups; let i = index; trackBy: groupId" class="group">
          <div class="group-head">
            <button type="button" class="group-toggle" (click)="group.collapsed = !group.collapsed"
              [attr.aria-expanded]="!group.collapsed" [attr.aria-controls]="'ssh-proxy-group-' + i" [title]="group.name">
              <span class="chevron" aria-hidden="true">{{ group.collapsed ? '▸' : '▾' }}</span>
              <i class="fas" [class.fa-folder]="group.collapsed" [class.fa-folder-open]="!group.collapsed" aria-hidden="true"></i>
              <strong>{{ group.name }}</strong>
            </button>
            <label>分组代理
              <select class="form-control" #groupRoute (change)="setRule(draft.groups, group.key, groupRoute.value)">
                ${routeOptions("draft.groups[group.key] || 'native'")}
              </select>
            </label>
          </div>
          <div class="group-children" [id]="'ssh-proxy-group-' + i" [hidden]="group.collapsed">
            <div class="profile" *ngFor="let p of group.profiles" [class.expanded]="active === p">
              <div class="profile-row">
                <button class="profile-name" (click)="inspect(p)" [attr.aria-expanded]="active === p" [title]="p.name + (p.options?.host ? ' · ' + p.options.host : '')">
                  <span class="chevron">{{ active === p ? '▾' : '▸' }}</span>
                  <strong>{{ p.name }}</strong><small class="mono">{{ p.options?.host }}</small>
                </button>
                <div class="row-controls">
                  <label class="follow"><input type="checkbox" #followGroup [checked]="!draft.profiles[p.id]"
                    (change)="setRule(draft.profiles, p.id, followGroup.checked ? '' : connectionChoice(p.id, group.key))">跟随分组</label>
                  <span class="profile-route" [title]="draft.profiles[p.id] ? '选择此连接的线路' : '跟随分组，取消勾选后可修改'">
                    <select class="form-control" #profileRoute [attr.aria-label]="p.name + ' 的线路'" [disabled]="!draft.profiles[p.id]" (change)="setRule(draft.profiles, p.id, profileRoute.value)">
                      ${routeOptions('connectionChoice(p.id, group.key)')}
                    </select>
                    <i class="fas" [class.fa-lock]="!draft.profiles[p.id]" [class.fa-chevron-down]="draft.profiles[p.id]" aria-hidden="true"></i>
                  </span>
                </div>
              </div>
              <div *ngIf="active === p" class="detail">
                <div class="route"><small>{{ previewSource }}</small><strong>{{ previewPath }}</strong></div>
                <div *ngIf="runtime.recent.get(p.id) as last" class="history">
                  最近成功 · {{ last.time }} · {{ last.source }} · {{ last.path }}
                </div>
                <div class="tools">
                  <label>临时线路
                    <select class="form-control" #temporaryRoute (change)="useTemporary(temporaryRoute.value)"
                      title="供右侧测试和连接使用，已保存的线路保持不变">
                      <option value="" [selected]="!temporary">使用当前配置</option>
                      ${routeOptions('temporary')}
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
        </div>
      </div>
      <p *ngIf="!count" class="muted">在 Tabby 添加 SSH 配置后，即可在此指定线路。</p>
    </section>
  </fieldset>
</main>`

export const styles: string = `
:host { display:block; color:inherit; }
:host-context(.tab-pane) { margin-inline:-12px; }
.manager {
  --line:rgba(193,211,226,.30); --tint:rgba(157,203,229,.12); --secondary:#e0e8ee;
  color:#f4f7fa; background:transparent; text-shadow:0 1px 3px rgba(12,18,24,.9);
  max-width:1440px; margin:0 auto; padding-block:clamp(14px,3vw,32px);
}
.manager * { box-sizing:border-box; }
fieldset { border:0; padding:0; min-width:0; margin:0; }
.heading,.section-title,.group-head,.profile-row { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.heading { margin-bottom:22px; } h2,h3,p { margin:0; }
h2 { font-size:1.6rem; letter-spacing:.015em; font-weight:650; } h3 { font-size:1.12rem; font-weight:650; }
.heading p,.muted,.history,small { color:var(--secondary); } .heading p { margin-top:5px; }
.panel { border:1px solid var(--line); border-radius:8px; padding:14px 16px; background:rgba(32,44,56,.20); }
.panel + .panel { margin-top:12px; }
.section-title { margin-bottom:14px; }
.preset-panel { --preset-label-size:.82rem; --preset-control-size:.88rem; padding-block:10px; container-type:inline-size; }
.preset-heading { gap:6px 12px; margin:0 0 6px; }
.preset-heading h3 { font-size:1.04rem; }
.add-preset { margin-inline-start:auto; }
.preset-panel .action { min-height:26px; padding:2px 8px; line-height:1.25; font-size:var(--preset-control-size); }
.preset-panel > .muted { margin-top:6px; }
button { cursor:pointer; } button:disabled { cursor:default; }
.action,.preset-summary,.profile-name,.group-toggle { color:inherit; background:transparent; font:inherit; text-shadow:inherit; }
.action { border:1px solid var(--line); border-radius:6px; padding:6px 11px; }
.action:hover,.preset-summary:hover,.preset-summary[aria-expanded=true],.profile-row:hover { background:var(--tint); }
.preset-row { border:1px solid rgba(193,211,226,.45); border-radius:6px; background:rgba(34,48,61,.18); }
.preset-row + .preset-row { margin-top:6px; }
.preset-row.editing { border-color:#8dd7f7; background:rgba(28,54,70,.46); box-shadow:inset 4px 0 #8dd7f7; }
.preset-row.editing .preset-summary { border-radius:5px 5px 0 0; border-bottom:1px solid var(--line); background:rgba(83,157,193,.34); }
.preset-summary { display:grid; grid-template-columns:10px minmax(0,1fr) 7em minmax(0,1fr); align-items:center; gap:6px; width:100%; min-height:29px; padding:3px 6px; border:0; border-radius:4px; text-align:start; }
.preset-summary strong,.preset-summary small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.preset-summary { font-size:.94rem; padding-inline-start:9px; } .preset-summary small { font-size:var(--preset-label-size); }
.preset-row .editor { padding:0 6px 8px 9px; }
.editor { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(100px,1fr) minmax(0,1.4fr) minmax(58px,.65fr) auto; align-items:end; gap:6px 8px; margin-top:6px; }
.editor label { line-height:1.2; font-size:var(--preset-label-size); }
.credentials { grid-column:1/-1; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) auto; grid-template-areas:"user password clear"; align-items:center; gap:4px 8px; border-top:1px solid var(--line); padding-top:6px; }
.auth-user { grid-area:user; } .auth-password { grid-area:password; }
.editor .credentials input { margin:0; }
.credentials .auth-clear { grid-area:clear; justify-self:end; border-color:transparent; color:var(--secondary); }
.preset-actions { display:flex; gap:8px; align-items:center; white-space:nowrap; }
.preset-actions .auth-toggle { display:inline-grid; grid-template-columns:12px auto; align-items:center; gap:5px; min-height:26px; margin:0; cursor:pointer; }
.auth-toggle input[type=checkbox] { position:static; transform:translateY(.5px); width:12px; height:12px; margin:0; }
.auth-toggle span { font-family:"Microsoft YaHei UI","PingFang SC",sans-serif; line-height:1; }
.editor .form-control { height:28px; min-height:28px; margin-top:2px; padding:2px 8px; font-size:var(--preset-control-size); }
.editor select.form-control { padding-inline-end:26px; }
label { display:block; margin:0; font-size:.88em; } label .form-control { margin-top:4px; }
.manager .form-control { color:#f4f7fa; background-color:rgba(34,48,61,.64); border:1px solid var(--line); }
.manager .form-control:disabled { color:var(--secondary); background-color:rgba(34,48,61,.48); opacity:1; }
.manager select option { color:#f4f7fa; background-color:#30404e; }
.form-control { min-width:0; width:100%; }
.mono { font-family:var(--bs-font-monospace,monospace); }
.route-help { margin:-4px 0 12px; font-size:.85rem; }
.route-list { max-height:min(55vh,480px); overflow-y:auto; overscroll-behavior-y:auto; }
.route-list:focus-visible { outline-offset:-2px; }
.group + .group { margin-top:8px; }
.group-head,.profile-row { flex-wrap:nowrap; gap:8px; padding:2px 8px; }
.group-head { border:1px solid var(--line); border-inline-start:3px solid #568caa; border-radius:5px; background:rgba(84,141,184,.18); }
.group-toggle strong { font-weight:700; }
.group-toggle i { color:#609cba; }
.group-children { margin-inline-start:15px; padding-inline-start:11px; border-inline-start:1px solid var(--line); }
.group-children .profile-row { position:relative; }
.profile-row::before { content:''; position:absolute; inset-inline-start:-11px; top:50%; width:10px; border-top:1px solid var(--line); }
.group-toggle>strong,.profile-name>strong,.profile-name>small { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.group-head label,.tools label { display:flex; align-items:center; gap:8px; }
.group-head label { flex:0 1 auto; min-width:0; white-space:nowrap; }
.group-head select,.tools select { width:auto; max-width:200px; margin:0; }
.group-head select,.row-controls select { width:clamp(120px,18vw,180px); height:26px; min-height:26px; margin:0; padding:1px 6px; line-height:1.2; font-size:.85rem; }
.profile-route { position:relative; display:inline-flex; }
.profile-route select.form-control { appearance:none; background-image:none; padding-inline-end:24px; text-overflow:ellipsis; }
.profile-route select:enabled { cursor:pointer; border-color:#84bbd5; background-color:rgba(42,76,97,.85); }
.profile-route select:enabled:hover,.profile-route select:focus-visible { border-color:#c3ebff; }
.profile-route select.form-control:disabled { pointer-events:none; cursor:default; border-style:dashed; background-color:rgba(34,48,61,.25); }
.profile-route i { position:absolute; inset-inline-end:8px; top:50%; transform:translateY(-50%); color:#c3ebff; font-size:10px; pointer-events:none; }
.profile-route select:disabled + i { color:var(--secondary); }
.row-controls,.follow { display:inline-flex; align-items:center; gap:8px; }
.row-controls { flex-shrink:0; } .follow { white-space:nowrap; cursor:pointer; gap:4px; }
.follow input { margin:0; }
.profile { border-bottom:1px solid var(--line); } .group .profile:last-child { border:0; }
.profile-name,.group-toggle { flex:1; min-width:0; min-height:26px; border:0; display:flex; align-items:center; text-align:left; gap:6px; padding:0; }
.profile-name>strong { flex:0 1 auto; font-weight:500; } .profile-name>small { flex:0 2 auto; }
.route,.history { overflow-wrap:anywhere; }
.chevron { opacity:.65; } .expanded { background:var(--tint); } .detail { padding:2px 8px 6px 16px; }
.route { display:flex; align-items:baseline; flex-wrap:wrap; gap:1px 6px; border-left:2px solid #559bb7; padding-left:6px; font-size:.85rem; }
.history,.progress-line { margin-top:3px; font-size:.8rem; }
.tools { display:grid; grid-template-columns:minmax(0,220px) auto auto; align-items:center; justify-content:start; gap:4px; margin-top:5px; }
.tools label { min-width:0; gap:4px; white-space:nowrap; }
.tools select { flex:1; width:0; }
.tools select,.tools button { min-height:26px; height:26px; padding:2px 6px; line-height:1.2; font-size:.83rem; }
.tools button { white-space:nowrap; }
.notice { margin:0 0 14px; border-left:3px solid #559bb7; padding:6px 10px; }
.error { border-left:3px solid #c97659; padding-left:9px; margin-top:8px; } :focus-visible { outline:2px solid #589ac1; outline-offset:2px; }
@container (max-width:550px) {
  .editor { grid-template-columns:minmax(0,1fr) minmax(100px,1fr) minmax(0,1.3fr) minmax(62px,.6fr); }
  .preset-actions { grid-column:1/-1; justify-content:flex-end; }
}
@container (max-width:400px) { .editor { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@container (max-width:290px) {
  .credentials { grid-template-columns:minmax(0,1fr) minmax(0,1.2fr); grid-template-areas:"user password" ". clear"; }
  .preset-summary { grid-template-columns:10px minmax(0,1fr) auto; }
  .preset-summary .mono { grid-column:2/-1; }
}
@media (max-width:520px) { .panel { padding:12px; } .detail { padding-left:10px; } }
.rules { container-type:inline-size; }
@container (max-width:340px) { .profile-row { flex-wrap:wrap; } .profile-name { flex-basis:100%; } .row-controls { margin-inline-start:auto; } }
@container (max-width:265px) {
  .tools { grid-template-columns:auto auto; }
  .tools label { grid-column:1 / -1; }
}
`
