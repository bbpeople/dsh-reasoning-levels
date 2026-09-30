/**
 * dsh-reasoning-levels 折叠功能单元验证
 * 用极简 React 垫片加载真实插件代码，断言折叠/展开行为。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 始终测试本仓库内的客户端代码（而不是某个已安装的副本）
const here = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(here, '..', 'lib', 'client.js');
if (!fs.existsSync(PLUGIN)) throw new Error('找不到待测文件：' + PLUGIN);

// ---------- DOM / BOM 垫片 ----------
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = {
  createElement: () => ({ textContent: '', appendChild() {}, setAttribute() {} }),
  head: { appendChild() {} },
  querySelector: () => null,
};
globalThis.window = {
  location: { pathname: '/', href: 'http://127.0.0.1:19387/' },
  localStorage: globalThis.localStorage,
  addEventListener() {},
};

// ---------- 假状态：两个供应商，各若干模型 ----------
const FAKE_STATE = {
  documentPath: 'C:/Users/x/.dsh/profiles/desktop/cordis.patch.yml',
  entryFound: true,
  levels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  providers: [
    {
      id: 'kiro',
      displayName: 'Kiro',
      models: [
        { id: 'm1', name: 'nemotron', efforts: { mode: 'levels', levels: { high: 'high' } } },
        { id: 'm2', name: 'kimi', efforts: { mode: 'inherit' } },
      ],
    },
    {
      id: 'router',
      displayName: 'Router',
      models: [{ id: 'm3', name: 'mimo', efforts: { mode: 'false' } }],
    },
  ],
};

let fetchCalls = 0;
globalThis.fetch = () =>
  Promise.resolve({ json: () => Promise.resolve({ ok: true, state: FAKE_STATE }) });

// ---------- 极简 React 垫片 ----------
let hooks = [];
let hookIndex = 0;
let effectRan = false;

const React = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat(Infinity).filter((c) => c != null) };
  },
  useState(init) {
    const i = hookIndex++;
    if (!(i in hooks)) hooks[i] = typeof init === 'function' ? init() : init;
    const setter = (v) => {
      hooks[i] = typeof v === 'function' ? v(hooks[i]) : v;
    };
    return [hooks[i], setter];
  },
  useEffect(fn) {
    if (!effectRan) {
      effectRan = true;
      fn();
    }
  },
};

function renderComponent(Comp) {
  hookIndex = 0;
  return Comp();
}

// ---------- 加载插件，取出组件 ----------
let captured = null;
let loaded = null;
globalThis.window.__ModuleLoader__ = {
  load(spec) {
    loaded = spec;
    const module = { exports: {} };
    const factoryExports = spec.factory((name) => {
      if (name === 'react') return React;
      throw new Error('unexpected require: ' + name);
    });
    // factory 返回 module.exports，其中含 apply/inject
    Object.assign(module.exports, factoryExports || {});
    // 触发 apply，捕获 slots.register 拿到的渲染函数
    const ctx = {
      get(name) {
        if (name !== 'slots') return undefined;
        return {
          inject(_slot, cb) {
            cb();
          },
          register(_key, fn) {
            captured = fn;
          },
        };
      },
    };
    module.exports.apply(ctx);
  },
};

await import('file://' + PLUGIN.replace(/\\/g, '/'));

const results = [];
const ok = (name, cond, extra = '') => results.push({ name, pass: !!cond, extra });

ok('插件已通过 __ModuleLoader__ 加载', loaded !== null && loaded.id === 'dsh-reasoning-levels');
ok('apply 已注册思考强度面板', typeof captured === 'function');

// 组件函数藏在 createElement(ReasoningLevels) 的 type 上
const first = captured();
const Comp = first.type;
ok('已取得组件函数', typeof Comp === 'function');

// ---------- 第一次渲染（fetch 未完成）----------
let tree = renderComponent(Comp);
const textOf = (node) => {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.children);
};
ok('初始态显示读取中', /读取中|暂无数据/.test(textOf(tree)), '实测：' + textOf(tree).slice(0, 40));

// 等 fetch 的 promise 链结算
await new Promise((r) => setTimeout(r, 30));

// ---------- 第二次渲染（有数据，默认应全部折叠）----------
tree = renderComponent(Comp);
const all = (node, out = []) => {
  if (node == null) return out;
  if (Array.isArray(node)) {
    node.forEach((n) => all(n, out));
    return out;
  }
  if (typeof node !== 'object') return out;
  out.push(node);
  all(node.children, out);
  return out;
};
const nodes = all(tree);
const byClass = (c) => nodes.filter((n) => typeof n.props.className === 'string' && n.props.className.split(/\s+/).includes(c));

const heads = byClass('dshrl-provtitle');
const modelBoxes = byClass('dshrl-models');
const rows = byClass('dshrl-row');

ok('渲染出 2 个供应商标题', heads.length === 2, '实测 ' + heads.length);
ok('默认折叠：不渲染任何模型容器', modelBoxes.length === 0, '实测 ' + modelBoxes.length);
ok('默认折叠：不渲染任何模型行', rows.length === 0, '实测 ' + rows.length);
ok('折叠时用 ▸ 指示', heads.every((h) => textOf(h).includes('▸')), '实测：' + heads.map((h) => textOf(h).slice(0, 24)).join(' | '));
ok('标题带 aria-expanded=false', heads.every((h) => h.props['aria-expanded'] === 'false'));
ok('标题显示模型数量', heads.some((h) => textOf(h).includes('2 个模型')) && heads.some((h) => textOf(h).includes('1 个模型')));
ok('标题显示已单独配置数', heads.some((h) => textOf(h).includes('已单独配置 1')), '实测：' + heads.map((h) => textOf(h)).join(' | '));
ok('存在全部展开/全部折叠按钮', nodes.some((n) => textOf(n) === '全部展开') && nodes.some((n) => textOf(n) === '全部折叠'));

// ---------- 点击第一个供应商标题 → 应展开 ----------
heads[0].props.onClick();
tree = renderComponent(Comp);
const nodes2 = all(tree);
const heads2 = nodes2.filter((n) => typeof n.props.className === 'string' && n.props.className.split(/\s+/).includes('dshrl-provtitle'));
const rows2 = nodes2.filter((n) => typeof n.props.className === 'string' && n.props.className.split(/\s+/).includes('dshrl-row'));
const boxes2 = nodes2.filter((n) => typeof n.props.className === 'string' && n.props.className.split(/\s+/).includes('dshrl-models'));

ok('点击后：展开的供应商渲染出模型容器', boxes2.length === 1, '实测 ' + boxes2.length);
ok('点击后：渲染出该供应商的 2 个模型行', rows2.length === 2, '实测 ' + rows2.length);
ok('点击后：第一个标题变 ▾', textOf(heads2[0]).includes('▾'), '实测：' + textOf(heads2[0]).slice(0, 24));
ok('点击后：第二个仍是 ▸ 折叠', textOf(heads2[1]).includes('▸'));
ok('点击后：aria-expanded 正确', heads2[0].props['aria-expanded'] === 'true' && heads2[1].props['aria-expanded'] === 'false');
ok('折叠状态已写入 localStorage', (store.get('dshrl.expanded.v1') || '').includes('"kiro":true'), '实测：' + store.get('dshrl.expanded.v1'));

// ---------- 全部展开 ----------
const expandBtn = nodes2.find((n) => textOf(n) === '全部展开');
expandBtn.props.onClick();
tree = renderComponent(Comp);
const rows3 = all(tree).filter((n) => typeof n.props.className === 'string' && n.props.className.split(/\s+/).includes('dshrl-row'));
ok('全部展开后渲染出 3 个模型行', rows3.length === 3, '实测 ' + rows3.length);

// ---------- 全部折叠 ----------
const nodes3 = all(tree);
const collapseBtn = nodes3.find((n) => textOf(n) === '全部折叠');
collapseBtn.props.onClick();
tree = renderComponent(Comp);
const rows4 = all(tree).filter((n) => typeof n.props.className === 'string' && n.props.className.split(/\s+/).includes('dshrl-row'));
ok('全部折叠后模型行归零', rows4.length === 0, '实测 ' + rows4.length);

// ---------- 折叠状态应被记住（重新挂载组件）----------
store.set('dshrl.expanded.v1', JSON.stringify({ router: true }));
effectRan = false;
hooks = [];
tree = renderComponent(Comp);
await new Promise((r) => setTimeout(r, 30));
tree = renderComponent(Comp);
const nodes5 = all(tree);
const heads5 = nodes5.filter((n) => typeof n.props.className === 'string' && n.props.className.split(/\s+/).includes('dshrl-provtitle'));
ok('记住折叠状态：router 展开、kiro 折叠',
  textOf(heads5[1]).includes('▾') && textOf(heads5[0]).includes('▸'),
  '实测：' + heads5.map((h) => textOf(h).slice(0, 18)).join(' | '));

// ---------- 键盘可达性 ----------
const kd = heads5[0].props.onKeyDown;
let prevented = false;
kd({ key: 'Enter', preventDefault: () => { prevented = true; } });
ok('标题支持 Enter 键展开', prevented === true);

// ---------- 输出 ----------
let pass = 0, fail = 0;
for (const r of results) {
  if (r.pass) pass++; else fail++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '   << ' + r.extra}`);
}
console.log(`\n合计 ${results.length} 项：通过 ${pass}，失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
