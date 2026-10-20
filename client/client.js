/* DSH System Prompt Manager — composer UI bundle; no bundler required. */
window.__ModuleLoader__.load({
  id: 'dsh-system-prompt-manager',
  factory: function (require) {
    var module = { exports: {} }
    var React = require('react')
    var h = React.createElement
    var CSS = [
      '.spm-root{position:relative;display:inline-flex;align-items:center;font-size:12px}',
      '.spm-trigger{border:1px solid var(--dsw-alias-border-l2,#7776);border-radius:12px;background:transparent;color:inherit;padding:4px 10px;cursor:pointer;max-width:240px}',
      '.spm-panel{position:absolute;bottom:calc(100% + 8px);left:0;z-index:1200;width:min(420px,90vw);max-height:75vh;overflow:auto;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#222);border:1px solid var(--dsw-alias-border-l2,#8886);border-radius:10px;box-shadow:0 10px 24px #0004;padding:12px;display:flex;flex-direction:column;gap:9px}',
      '.spm-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.spm-row label{font-weight:600;min-width:65px}',
      '.spm-panel select,.spm-panel input,.spm-panel textarea{box-sizing:border-box;background:var(--dsw-alias-bg-layer-2,#8881);color:inherit;border:1px solid var(--dsw-alias-border-l2,#8886);border-radius:6px;padding:5px;min-width:0}',
      '.spm-panel select{flex:1}.spm-panel input{flex:1}.spm-panel textarea{width:100%;min-height:140px;resize:vertical;white-space:pre-wrap;font:12px/1.5 monospace}',
      '.spm-panel button{border:1px solid var(--dsw-alias-border-l2,#8886);background:transparent;color:inherit;border-radius:6px;padding:4px 8px;cursor:pointer}',
      '.spm-panel button:disabled{opacity:.4;cursor:default}',
      '.spm-muted{color:var(--dsw-alias-label-secondary,#777);font-size:11px;line-height:1.5}',
      '.spm-warn{background:rgba(240,170,30,.13);padding:7px;border-radius:6px}',
      '.spm-error{color:var(--dsw-alias-state-error-primary,#d44);white-space:pre-wrap}',
      '.spm-title{font-weight:600;font-size:14px;flex:1}',
    ].join('\n')

    function api(endpoint, body) {
      return fetch('/dsh-spm/' + endpoint, body === undefined ? { cache: 'no-store' } : {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function (res) {
        return res.json().then(function (json) {
          if (!res.ok || !json.ok) throw new Error(json.error || 'HTTP ' + res.status)
          return json
        })
      })
    }

    function PromptControl(props) {
      var sid = props.sessionId
      var open = React.useState(false)
      var loaded = React.useState(null)
      var busy = React.useState(false)
      var error = React.useState('')
      var notice = React.useState('')
      var editor = React.useState(null)
      var root = React.useRef(null)
      var fileRef = React.useRef(null)

      function reload() {
        if (!sid) return Promise.resolve()
        return api('state?sid=' + encodeURIComponent(sid)).then(loaded[1]).catch(function (e) { error[1](e.message) })
      }
      React.useEffect(function () { loaded[1](null); reload() }, [sid])
      React.useEffect(function () {
        if (!open[0]) return
        function click(ev) { if (root.current && !root.current.contains(ev.target)) open[1](false) }
        function esc(ev) { if (ev.key === 'Escape') open[1](false) }
        document.addEventListener('mousedown', click)
        document.addEventListener('keydown', esc)
        return function () { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', esc) }
      }, [open[0]])

      function action(promise, success) {
        busy[1](true); error[1](''); notice[1]('')
        return promise.then(function (data) {
          if (success) success(data)
          return reload()
        }).catch(function (e) { error[1](e.message) }).finally(function () { busy[1](false) })
      }
      function switchMode(mode, templateId) {
        return action(api('mode', { sessionId: sid, mode: mode, templateId: templateId }), function (r) {
          notice[1](r.pending
            ? '任务正在运行；将在任务结束后的下一轮生效。旧对话历史仍可能影响输出。'
            : '下一轮请求生效。旧对话历史仍可能影响输出。')
        })
      }
      function saveTemplate() {
        var t = editor[0]
        return action(api('template', { id: t.id, name: t.name, text: t.text }), function () { editor[1](null) })
      }
      function erase(id) {
        if (!window.confirm('确定删除此模板？正在使用的模板不能删除。')) return
        return action(api('delete', { id: id }))
      }
      function clone(t) {
        return action(api('template', { name: t.name + '（副本）', text: t.text }))
      }
      function downloadFile(fileName, text, type) {
        var url = URL.createObjectURL(new Blob([text], { type: type }))
        var a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }
      async function importFile(ev) {
        var file = ev.target.files && ev.target.files[0]
        if (!file) return
        try {
          var data = new Uint8Array(await file.arrayBuffer())
          var text = new TextDecoder('utf-8', { fatal: true }).decode(data)
          var name = file.name.replace(/\.(txt|json)$/i, '')
          if (/\.json$/i.test(file.name)) {
            var json = JSON.parse(text)
            text = typeof json === 'string' ? json : json.text
            name = json.name || name
          }
          if (typeof text !== 'string' || !text) throw new Error('文件不包含有效提示词')
          editor[1]({ id: null, name: name.slice(0, 100), text: text })
        } catch (e) { error[1]('导入失败：' + e.message) }
        ev.target.value = ''
      }
      var state = loaded[0]
      var selection = state?.selection || { mode: 'native', templateId: null }
      var mode = selection.mode
      var templates = state?.templates || []
      var activeTemplate = templates.find(function (t) { return t.id === selection.templateId })
      var currentLabel = mode === 'native' ? '原生' : mode === 'none' ? '无系统提示词' :
        '自定义 · ' + (activeTemplate?.name || '模板已丢失')
      if (!sid) return null

      var panel = open[0] ? h('div', { className: 'spm-panel' },
        h('div', { className: 'spm-row' }, h('span', { className: 'spm-title' }, '系统提示词管理'),
          h('button', { onClick: function () { open[1](false) } }, '关闭')),
        h('div', { className: 'spm-row' },
          h('label', null, '当前模式'),
          h('select', { value: mode, disabled: busy[0] || !state,
            onChange: function (ev) { switchMode(ev.target.value, ev.target.value === 'custom' ? (selection.templateId || templates[0]?.id) : null) } },
          h('option', { value: 'native' }, '原生（DSH 默认）'),
          h('option', { value: 'custom', disabled: !templates.length }, '自定义（完整替换）'),
          h('option', { value: 'none' }, '无系统提示词'))),
        mode === 'custom' ? h('div', { className: 'spm-row' },
          h('label', null, '选择模板'),
          h('select', { value: selection.templateId || '', disabled: busy[0],
            onChange: function (ev) { switchMode('custom', ev.target.value) } },
          templates.map(function (t) { return h('option', { value: t.id, key: t.id }, t.name + ' · r' + t.revision) }))) : null,
        h('div', { className: 'spm-muted spm-warn' },
          '允许在历史会话切换，下一轮生效。此前对话中包含的旧系统指令或回答仍可能影响输出；如需干净隔离，请新建会话。'),
        state?.pending ? h('div', { className: 'spm-muted' }, '当前任务尚在运行，切换已排队。') : null,
        h('div', { className: 'spm-row' },
          h('label', null, '新会话默认'),
          h('select', { value: state?.defaultMode || 'native', disabled: busy[0],
            onChange: function (ev) {
              var m = ev.target.value
              action(api('default', { mode: m, templateId: m === 'custom'
                ? (state?.defaultTemplateId || templates[0]?.id) : null }))
            } },
          h('option', { value: 'native' }, '原生'),
          h('option', { value: 'custom', disabled: !templates.length }, '自定义'),
          h('option', { value: 'none' }, '无系统提示词'))),
        h('div', { className: 'spm-row' },
          h('strong', null, '模板库'), h('span', { style: { flex: 1 } }),
          h('button', { disabled: busy[0], onClick: function () { editor[1]({ id: null, name: '', text: '' }) } }, '新建'),
          h('button', { disabled: busy[0], onClick: function () { fileRef.current?.click() } }, '导入')),
        h('input', { ref: fileRef, type: 'file', accept: '.txt,.json,text/plain,application/json',
          style: { display: 'none' }, onChange: importFile }),
        templates.map(function (t) {
          return h('div', { className: 'spm-row', key: t.id },
            h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' } }, t.name),
            h('button', { disabled: busy[0], onClick: function () { editor[1]({ id: t.id, name: t.name, text: t.text }) } }, '编辑'),
            h('button', { disabled: busy[0], onClick: function () { clone(t) } }, '复制'),
            h('button', { disabled: busy[0], onClick: function () {
              downloadFile(t.name + '.json', JSON.stringify({ name: t.name, text: t.text }, null, 2),
                'application/json;charset=utf-8')
            } }, '导出'),
            h('button', { disabled: busy[0], onClick: function () { erase(t.id) } }, '删除'))
        }),
        editor[0] ? h('div', null,
          h('div', { className: 'spm-row' }, h('label', null, '模板名称'),
            h('input', { value: editor[0].name, maxLength: 100, onChange: function (ev) {
              editor[1]({ ...editor[0], name: ev.target.value })
            } })),
          h('textarea', { value: editor[0].text, maxLength: 100000, onChange: function (ev) {
            editor[1]({ ...editor[0], text: ev.target.value })
          } }),
          h('div', { className: 'spm-muted' }, editor[0].text.length + ' / 100000 字符（原样保存，不插值）'),
          h('div', { className: 'spm-row' },
            h('button', { disabled: busy[0], onClick: saveTemplate }, '保存'),
            h('button', { onClick: function () { editor[1](null) } }, '取消'))) : null,
        h('div', { className: 'spm-row' },
          h('button', { disabled: busy[0], onClick: function () {
            action(api('diagnose?sid=' + encodeURIComponent(sid)).then(function (x) { return x }))
          } }, '刷新状态'),
          h('button', { disabled: busy[0], onClick: reload }, '重新载入')),
        notice[0] ? h('div', { className: 'spm-muted' }, notice[0]) : null,
        error[0] ? h('div', { className: 'spm-error' }, error[0]) : null
      ) : null

      return h('div', { className: 'spm-root', ref: root },
        h('button', { className: 'spm-trigger', type: 'button',
          title: '选择此会话的系统提示词模式', onClick: function () { open[1](!open[0]); if (!open[0]) reload() } },
        '系统提示词 · ' + currentLabel + (state?.pending ? '（待生效）' : '')),
        panel)
    }

    module.exports.apply = function apply(ctx) {
      ctx.effect(function () {
        var style = document.createElement('style')
        style.setAttribute('data-plugin-css', 'dsh-system-prompt-manager')
        style.textContent = CSS
        document.head.appendChild(style)
        return function () { style.remove() }
      }, 'spm:styles')
      ctx.slots.inject('conversation.input.left', function () {
        return ctx.slots.register(
          { name: 'conversation.input.left', id: 'dsh-system-prompt-manager', order: 6, label: '系统提示词' },
          function (props) { return h(PromptControl, { sessionId: props.sessionId }) })
      })
    }
    module.exports.name = 'dsh-system-prompt-manager'
    module.exports.inject = ['slots']
    return module.exports
  },
})
