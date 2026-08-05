import React, { useEffect, useRef } from 'react';
import { useWebSocketContext } from '../../hooks/useBroadcastContext';
import useGlobalStore from '../../../settings-window/stores/useGlobalStore';
import '../../../common/shell/appShell.css';

function classifyLog(content: string): { tag: string; tone: string } {
  const t = content || '';
  if (/error|失败|错误|exception/i.test(t)) {
    return { tag: 'ERR', tone: 'err' };
  }
  if (/warn|警告|偏低|停用/i.test(t)) {
    return { tag: 'WARN', tone: 'warn' };
  }
  if (/成功|已创建|已开启|已连接|ok\b/i.test(t)) {
    return { tag: 'OK', tone: 'ok' };
  }
  if (/\[info\]|info/i.test(t)) {
    return { tag: 'INFO', tone: 'info' };
  }
  return { tag: 'INFO', tone: 'info' };
}

function stripLeadingTag(content: string): string {
  return content.replace(/^\s*\[(INFO|OK|ERR|WARN|ERROR)\]\s*/i, '');
}

const LogBox = () => {
  const { logs, clearLogs, addLog } = useGlobalStore();
  const { registerEventHandler } = useWebSocketContext();
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unregister = registerEventHandler((message) => {
      if (message.event === 'log_show') {
        if (message.data) {
          const log = message.data as {
            time: string;
            content: string;
          };

          if (log) {
            addLog(log);
          }
        }
      }
    });

    return () => unregister();
  }, [registerEventHandler]); // eslint-disable-line

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div className="cs-console">
      <div className="cs-console-head">
        <span className="cs-console-bar" />
        <span className="cs-console-title">运行窗口 · 统一监控</span>
        <div className="cs-console-actions">
          <button type="button" onClick={() => clearLogs()}>
            清空
          </button>
          <button
            type="button"
            onClick={() =>
              window.electron.ipcRenderer.sendMessage('open-logger-folder')
            }
          >
            打开日志文件
          </button>
        </div>
      </div>
      <div className="cs-console-body" ref={bodyRef}>
        {logs.length === 0 ? (
          <div className="cs-console-line">
            <span className="cs-console-tag live">live</span>
            <span className="cs-console-msg muted">等待事件…</span>
          </div>
        ) : (
          logs.map((log, index) => {
            const { tag, tone } = classifyLog(log.content || '');
            return (
              <div className="cs-console-line" key={`${log.time}-${index}`}>
                <span className={`cs-console-tag ${tone}`}>{tag}</span>
                <span className="cs-console-time">[{log.time}]</span>
                <span className="cs-console-msg">
                  {stripLeadingTag(log.content || '')}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default React.memo(LogBox);
