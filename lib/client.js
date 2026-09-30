window.__ModuleLoader__.load({
  id: 'dsh-reasoning-levels',
  factory: (require) => {
    var React = require('react');
    var module = { exports: {} };
    var exports = module.exports;

    var LEVEL_LABELS = { off: '关闭', minimal: '极低', low: '低', medium: '中', high: '高', xhigh: '超高', max: '最高' };
    var FALLBACK_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    var MODES = [
      { value: 'levels', label: '按档位' },
      { value: 'false', label: '非推理模型 (false)' },
      { value: 'inherit', label: '跟随内置目录（不写字段）' }
    ];

    // ---------- 供应商折叠状态（记在浏览器本地，刷新后保持） ----------
    var COLLAPSE_KEY = 'dshrl.expanded.v1';

    function readExpanded() {
      try {
        var raw = window.localStorage.getItem(COLLAPSE_KEY);
        if (!raw) return {};
        var obj = JSON.parse(raw);
        return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
      } catch (e) {
        return {};
      }
    }

    function writeExpanded(next) {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch (e) {
        /* 隐私模式等场景写入失败时忽略，仅影响记忆折叠状态 */
      }
    }

    // ---------- HTTP 桥接 ----------
    function apiBase() {
      var p = window.location.pathname;
      var idx = p.lastIndexOf('/');
      var base = idx >= 0 ? p.slice(0, idx + 1) : '/';
      return base + 'rlevels/';
    }

    // ---------- 样式 ----------
    var styles = document.createElement('style');
    styles.textContent = [
      '.dshrl { display: flex; flex-direction: column; gap: 12px; font-size: 13px; }',
      '.dshrl-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }',
      '.dshrl-hint { margin: 0; font-size: 12px; line-height: 1.7; color: var(--dsh-text-secondary, #8a8f98); }',
      '.dshrl-path { font-size: 11px; word-break: break-all; color: var(--dsh-text-tertiary, #6b7280); margin: 4px 0 0; }',
      '.dshrl-btn { font: inherit; padding: 5px 12px; border-radius: 6px; border: 1px solid var(--dsh-border, #2a2d34); background: var(--dsh-surface, #1f2227); color: var(--dsh-text, #e6e8eb); cursor: pointer; flex: none; }',
      '.dshrl-btn:hover { background: var(--dsh-surface-hover, #272b31); }',
      '.dshrl-btn:disabled { opacity: .5; cursor: default; }',
      '.dshrl-warn { padding: 8px 10px; border-radius: 8px; background: rgba(255,184,84,.12); color: #ffc069; font-size: 12.5px; }',
      '.dshrl-prov { display: flex; flex-direction: column; gap: 6px; }',
      '.dshrl-provtitle { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--dsh-text, #e6e8eb); cursor: pointer; user-select: none; padding: 5px 6px; border-radius: 6px; }',
      '.dshrl-provtitle:hover { background: var(--dsh-surface-hover, #272b31); }',
      '.dshrl-provtitle:focus-visible { outline: 1px solid var(--dsh-accent, #4b8bf5); outline-offset: 1px; }',
      '.dshrl-caret { flex: none; width: 11px; font-size: 10px; line-height: 1; color: var(--dsh-text-tertiary, #6b7280); }',
      '.dshrl-provtitle .meta { font-weight: 400; color: var(--dsh-text-tertiary, #6b7280); font-size: 11.5px; }',
      '.dshrl-models { display: flex; flex-direction: column; gap: 6px; padding-left: 17px; }',
      '.dshrl-actions { display: flex; gap: 6px; flex: none; }',
      '.dshrl-row { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border: 1px solid var(--dsh-border, #2a2d34); border-radius: 8px; background: var(--dsh-surface-raised, #23262c); }',
      '.dshrl-rowhead { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }',
      '.dshrl-name { font-weight: 500; color: var(--dsh-text, #e6e8eb); }',
      '.dshrl-id { font-family: ui-monospace, Consolas, monospace; font-size: 11px; color: var(--dsh-text-tertiary, #6b7280); word-break: break-all; flex: 1; min-width: 120px; }',
      '.dshrl-select { font: inherit; font-size: 12px; padding: 3px 6px; border-radius: 6px; border: 1px solid var(--dsh-border, #2a2d34); background: var(--dsh-surface, #1f2227); color: var(--dsh-text, #e6e8eb); }',
      '.dshrl-levels { display: flex; flex-wrap: wrap; gap: 6px 14px; }',
      '.dshrl-level { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; font-size: 12.5px; color: var(--dsh-text, #e6e8eb); }',
      '.dshrl-level input { margin: 0; }',
      '.dshrl-level.off { opacity: .45; }',
      '.dshrl-wire { font-family: ui-monospace, Consolas, monospace; font-size: 10.5px; color: var(--dsh-text-tertiary, #6b7280); }',
      '.dshrl-msg { font-size: 12.5px; color: var(--dsh-text-secondary, #8a8f98); white-space: pre-wrap; }',
      '.dshrl-msg.err { color: #ff8f8f; }',
      '.dshrl-empty { font-size: 12.5px; color: var(--dsh-text-tertiary, #6b7280); padding: 8px 0; }'
    ].join('\n');
    document.head.appendChild(styles);

    // ---------- 组件 ----------
    function ReasoningLevels() {
      var pair = React.useState({ data: null, busy: false, msg: '', err: false });
      var ui = pair[0];
      var setUi = pair[1];

      var cpair = React.useState(readExpanded);
      var expanded = cpair[0];
      var setExpanded = cpair[1];

      function toggleProvider(id) {
        var next = {};
        for (var k in expanded) {
          if (Object.prototype.hasOwnProperty.call(expanded, k)) next[k] = expanded[k];
        }
        next[id] = expanded[id] !== true;
        setExpanded(next);
        writeExpanded(next);
      }

      function expandAll(flag) {
        var next = {};
        var list = (ui.data && ui.data.providers) ? ui.data.providers : [];
        for (var i = 0; i < list.length; i++) next[list[i].id] = flag;
        setExpanded(next);
        writeExpanded(next);
      }

      function load() {
        setUi({ data: ui.data, busy: true, msg: '', err: false });
        fetch(apiBase() + 'list').then(function (r) { return r.json(); }).then(function (d) {
          if (!d || !d.ok) { setUi({ data: null, busy: false, msg: '读取失败：' + ((d && d.error) || '未知错误'), err: true }); return; }
          setUi({ data: d.state, busy: false, msg: '', err: false });
        }).catch(function (e) {
          setUi({ data: null, busy: false, msg: '读取失败：' + e.message, err: true });
        });
      }

      React.useEffect(function () { load(); }, []);

      function save(provider, model, mode, levels, okMsg) {
        setUi({ data: ui.data, busy: true, msg: '保存中…', err: false });
        fetch(apiBase() + 'set', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider: provider, model: model, mode: mode, levels: levels })
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (!d || !d.ok) { setUi({ data: ui.data, busy: false, msg: '保存失败：' + ((d && d.error) || '未知错误'), err: true }); return; }
          setUi({ data: d.state, busy: false, msg: okMsg || '已保存并即时生效', err: false });
        }).catch(function (e) {
          setUi({ data: ui.data, busy: false, msg: '保存失败：' + e.message, err: true });
        });
      }

      var s = ui.data;
      var allLevels = (s && Array.isArray(s.levels) && s.levels.length) ? s.levels : FALLBACK_LEVELS;

      function selectedOf(m) {
        var lv = (m.efforts && m.efforts.mode === 'levels' && m.efforts.levels) ? m.efforts.levels : {};
        return allLevels.filter(function (x) { return Object.prototype.hasOwnProperty.call(lv, x); });
      }

      function wireOf(m, level) {
        var lv = (m.efforts && m.efforts.levels) ? m.efforts.levels : {};
        if (Object.prototype.hasOwnProperty.call(lv, level) && lv[level] !== null && lv[level] !== undefined) return lv[level];
        return level === 'off' ? 'null' : level;
      }

      function onToggle(prov, m, level) {
        var cur = selectedOf(m);
        var picked = cur.indexOf(level) >= 0
          ? cur.filter(function (x) { return x !== level; })
          : cur.concat([level]);
        var next = allLevels.filter(function (x) { return picked.indexOf(x) >= 0; });
        if (!next.some(function (x) { return x !== 'off'; })) {
          setUi({ data: ui.data, busy: false, err: true, msg: '至少要保留一个高于「关闭」的档位；若该模型不支持思考，请把模式改为「非推理模型」' });
          return;
        }
        save(prov.id, m.id, 'levels', next);
      }

      function onMode(prov, m, mode) {
        if (mode === 'levels') {
          var cur = selectedOf(m);
          var next = cur.filter(function (x) { return x !== 'off'; });
          if (next.length === 0) next = ['high'];
          save(prov.id, m.id, 'levels', next, '已切换为按档位模式');
          return;
        }
        save(prov.id, m.id, mode, [],
          mode === 'false' ? '已标记为非推理模型（reasoningEfforts: false）' : '已删除该字段（跟随内置目录的能力声明）');
      }

      return React.createElement('div', { className: 'dshrl' },
        React.createElement('div', { className: 'dshrl-head' },
          React.createElement('div', null,
            React.createElement('p', { className: 'dshrl-hint' },
              '勾选每个模型可用的思考档位，写入当前 profile 的 cordis.patch.yml 并立即生效；对话里的模型选择器会随之只显示这些档位。',
              React.createElement('br', null),
              '点击供应商名称可折叠或展开其模型列表，折叠状态会记住。'),
            (s && s.documentPath) ? React.createElement('p', { className: 'dshrl-path' }, '配置文件：' + s.documentPath) : null
          ),
          React.createElement('div', { className: 'dshrl-actions' },
            React.createElement('button', { className: 'dshrl-btn', disabled: ui.busy, onClick: function () { expandAll(true); } }, '全部展开'),
            React.createElement('button', { className: 'dshrl-btn', disabled: ui.busy, onClick: function () { expandAll(false); } }, '全部折叠'),
            React.createElement('button', { className: 'dshrl-btn', disabled: ui.busy, onClick: load }, '刷新')
          )
        ),
        (s && s.entryFound === false)
          ? React.createElement('div', { className: 'dshrl-warn' }, '当前 profile 里没有可编辑的 llm-pi-ai 条目，无法在此编辑思考档位。')
          : null,
        !s
          ? React.createElement('div', { className: 'dshrl-empty' }, ui.busy ? '读取中…' : '暂无数据')
          : (s.providers || []).map(function (prov) {
              var open = expanded[prov.id] === true;
              var configured = 0;
              for (var ci = 0; ci < prov.models.length; ci++) {
                var ef = prov.models[ci].efforts;
                if (ef && ef.mode && ef.mode !== 'inherit') configured++;
              }
              return React.createElement('div', { key: prov.id, className: 'dshrl-prov' },
                React.createElement('div', {
                  className: 'dshrl-provtitle',
                  role: 'button',
                  tabIndex: 0,
                  'aria-expanded': open ? 'true' : 'false',
                  title: open ? '点击折叠该供应商的模型列表' : '点击展开该供应商的模型列表',
                  onClick: function () { toggleProvider(prov.id); },
                  onKeyDown: function (e) {
                    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                      e.preventDefault();
                      toggleProvider(prov.id);
                    }
                  }
                },
                  React.createElement('span', { className: 'dshrl-caret' }, open ? '▾' : '▸'),
                  prov.displayName,
                  React.createElement('span', { className: 'meta' },
                    prov.id + ' · ' + prov.models.length + ' 个模型' + (configured > 0 ? ' · 已单独配置 ' + configured : ''))
                ),
                !open ? null : (prov.models.length === 0
                  ? React.createElement('div', { className: 'dshrl-empty' }, '该 provider 未配置模型')
                  : React.createElement('div', { className: 'dshrl-models' }, prov.models.map(function (m) {
                      var mode = m.efforts ? m.efforts.mode : 'inherit';
                      var selected = selectedOf(m);
                      return React.createElement('div', { key: m.id, className: 'dshrl-row' },
                        React.createElement('div', { className: 'dshrl-rowhead' },
                          React.createElement('span', { className: 'dshrl-name' }, m.name),
                          React.createElement('span', { className: 'dshrl-id' }, m.id),
                          React.createElement('select', {
                            className: 'dshrl-select',
                            value: mode,
                            disabled: ui.busy,
                            onChange: function (e) { onMode(prov, m, e.target.value); }
                          }, MODES.map(function (o) {
                            return React.createElement('option', { key: o.value, value: o.value }, o.label);
                          }))
                        ),
                        React.createElement('div', { className: 'dshrl-levels' },
                          allLevels.map(function (level) {
                            return React.createElement('label', {
                              key: level,
                              className: 'dshrl-level' + (mode === 'levels' ? '' : ' off'),
                              title: 'wire 值：' + wireOf(m, level)
                            },
                              React.createElement('input', {
                                type: 'checkbox',
                                checked: selected.indexOf(level) >= 0,
                                disabled: ui.busy || mode !== 'levels',
                                onChange: function () { onToggle(prov, m, level); }
                              }),
                              React.createElement('span', null, LEVEL_LABELS[level] || level),
                              React.createElement('span', { className: 'dshrl-wire' }, wireOf(m, level))
                            );
                          })
                        )
                      );
                    })))
              );
            }),
        ui.msg ? React.createElement('div', { className: 'dshrl-msg' + (ui.err ? ' err' : '') }, ui.msg) : null
      );
    }

    // ---------- 插件入口：挂到「插件」分组下的独立 tab ----------
    function apply(ctx) {
      var slots = ctx.get('slots');
      if (slots === undefined) return;
      slots.inject('settings.plugins.tab', function () {
        return slots.register(
          { name: 'settings.plugins.tab', id: 'reasoning-levels', order: 51, label: '思考强度' },
          function () { return React.createElement(ReasoningLevels); }
        );
      });
    }

    exports.apply = apply;
    // rc.3 起客户端 fiber 只注入已声明的服务；slots 是硬依赖，必须声明
    exports.inject = ['slots'];
    return module.exports;
  }
});
