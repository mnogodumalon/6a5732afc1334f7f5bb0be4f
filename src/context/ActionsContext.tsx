import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import type { Action, ActionCodeChangedEvent, FileAttachment } from '@/lib/actions-agent';
import { fetchActionsAndFiles, executeAction, deleteAction as deleteActionApi, deleteAppAttachment as deleteAppAttachmentApi, agentChat, fixAction, revertAction as revertActionApi, downloadFile } from '@/lib/actions-agent';

export type ExecErrorContext = {
  actionName: string;
  actionIdentifier: string;
  appId: string;
  errorText: string;
  stdout?: string;
  inputs?: Record<string, unknown>;
  files?: File[];
};

// Where the code drawer should land when opened (e.g. from a version card)
export type CodeDrawerFocus = { version: number; tab: 'code' | 'diff' };

// Payload of a version card in the chat — one per code save by the agent
export type VersionInfo = {
  appId: string;
  actionIdentifier: string;
  version: number;
  summary: string;
  origin: string;
};

// Result of the most recent action execution — feeds the code drawer's
// output tab (version is set for test-runs of a historical version)
export type RunResult = {
  appId: string;
  actionIdentifier: string;
  actionName: string;
  version: number | null;
  inputs?: Record<string, unknown>;
  files?: File[];
  stdout: string | null;
  error: string | null;
  ts: number;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string;
  // Original filename of the attached file — the agent stages uploads
  // under this name instead of a generated upload_NN.ext.
  imageName?: string;
  // 'action' = auto-generated invocation notice (Aktion: …), styled as a
  // neutral system event instead of a primary user bubble.
  kind?: 'action';
  fixContext?: ExecErrorContext;
  versionInfo?: VersionInfo;
};

interface ActionsContextType {
  actions: Action[];
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  messages: Message[];
  chatLoading: boolean;
  runAction: (action: Action, version?: number, opts?: { silent?: boolean }) => void;
  lastRunResult: RunResult | null;
  sendMessage: (text: string, image?: string, imageName?: string) => void;
  fixError: (messageId: string) => void;
  fixLastRun: () => void;
  fixingMessageId: string | null;
  runningActionId: string | null;
  devMode: boolean;
  setDevMode: (v: boolean) => void;
  betaMode: boolean;
  setBetaMode: (v: boolean) => void;
  showActionCode: (action: Action) => void;
  actionsDrawerOpen: boolean;
  openActionsDrawer: () => void;
  closeActionsDrawer: () => void;
  codeDrawerAction: Action | null;
  codeDrawerFocus: CodeDrawerFocus | null;
  openCodeDrawer: (action: Action, focus?: CodeDrawerFocus) => void;
  openCodeDrawerFor: (appId: string, identifier: string, focus?: CodeDrawerFocus) => void;
  closeCodeDrawer: () => void;
  backToActions: () => void;
  actionsHighlight: { appId: string; identifier: string } | null;
  revertActionVersion: (appId: string, identifier: string, to: number, expectedCurrent?: number) => Promise<void>;
  deleteAction: (action: Action) => Promise<void>;
  inputFormAction: Action | null;
  inputFormOptions: Record<string, Array<{ value: string; label: string }>> | null;
  submitActionInputs: (action: Action, inputs: Record<string, unknown>, files: File[]) => void;
  cancelInputForm: () => void;
  files: FileAttachment[];
  filesByAction: Record<string, FileAttachment[]>;
  downloadFile: (url: string, filename: string) => Promise<void>;
  deleteAppAttachment: (file: FileAttachment) => Promise<void>;
}

const ActionsContext = createContext<ActionsContextType | null>(null);

function readChannelCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some(c => c === 'channel=beta');
}

function writeChannelCookie(beta: boolean): void {
  const value = beta ? 'beta' : 'stable';
  document.cookie = `channel=${value}; path=/; max-age=31536000; SameSite=Lax`;
}

function execErrorUpdate(
  action: Action,
  errorText: string,
  stdout?: string | null,
  inputs?: Record<string, unknown>,
  files?: File[],
): Pick<Message, 'content' | 'fixContext'> {
  const name = action.title || action.identifier;
  return {
    content: `**Etwas klappte nicht bei der Ausführung von \`${name}\`:**\n\`\`\`\n${errorText}\n\`\`\``,
    fixContext: {
      actionName: name,
      actionIdentifier: action.identifier,
      appId: action.app_id,
      errorText,
      stdout: stdout || undefined,
      inputs,
      files,
    },
  };
}

export function useActions() {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error('useActions must be used within ActionsProvider');
  return ctx;
}

export function ActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<Action[]>([]);
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState(() => crypto.randomUUID());
  const [fixingMessageId, setFixingMessageId] = useState<string | null>(null);
  const chatLoadingRef = useRef(false);
  const [inputFormAction, setInputFormAction] = useState<Action | null>(null);
  const [inputFormOptions, setInputFormOptions] = useState<
    Record<string, Array<{ value: string; label: string }>> | null
  >(null);

  const filesByAction = useMemo(() => {
    const map: Record<string, FileAttachment[]> = {};
    for (const f of files) {
      const key = f.action_identifier || '__unassigned__';
      (map[key] ??= []).push(f);
    }
    return map;
  }, [files]);

  const [devMode, setDevMode] = useState(() => {
    try { return localStorage.getItem('developer-mode') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('developer-mode', String(devMode)); } catch {}
  }, [devMode]);

  const [betaMode, setBetaModeState] = useState(() => {
    try { return readChannelCookie(); } catch { return false; }
  });

  const setBetaMode = useCallback((v: boolean) => {
    setBetaModeState(v);
    try { writeChannelCookie(v); } catch {}
  }, []);

  const refreshActions = useCallback(async () => {
    try {
      const result = await fetchActionsAndFiles();
      setActions(result.actions);
      setFiles(result.files);
    } catch {
      // silently ignore — actions panel will be empty
    }
  }, []);

  useEffect(() => {
    void refreshActions();
  }, [refreshActions]);

  // The Werkzeuge drawer and the code drawer form one navigation stack:
  // the overview is the base level, the code view stacks on top of it.
  const [actionsDrawerOpen, setActionsDrawerOpen] = useState(false);
  // Briefly marks the card the user returned from (code drawer → back)
  const [actionsHighlight, setActionsHighlight] = useState<{ appId: string; identifier: string } | null>(null);

  useEffect(() => {
    if (!actionsHighlight) return;
    const t = setTimeout(() => setActionsHighlight(null), 1600);
    return () => clearTimeout(t);
  }, [actionsHighlight]);

  const openActionsDrawer = useCallback(() => setActionsDrawerOpen(true), []);
  const closeActionsDrawer = useCallback(() => setActionsDrawerOpen(false), []);

  // On execution errors the Werkzeug UI must give way to the chat, where the
  // exception and the auto-fix button live.
  const focusChatOnError = useCallback(() => {
    setActionsDrawerOpen(false);
    setChatOpen(true);
  }, []);

  const [lastRunResult, setLastRunResult] = useState<RunResult | null>(null);

  // silent = drawer-initiated run: the drawer's output tab is the single
  // surface — no chat bubbles, no chat-busy state, no focus stealing. The
  // chat stays reserved for the conversation with the agent.
  const executeAndReport = useCallback((action: Action, inputs?: Record<string, unknown>, files?: File[], version?: number, silent = false) => {
    if (chatLoadingRef.current) return;
    chatLoadingRef.current = true;
    if (!silent) setChatLoading(true);
    setRunningActionId(action.identifier);
    if (!silent) setChatOpen(true);

    const placeholderId = crypto.randomUUID();
    if (!silent) {
      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', kind: 'action', content: `Aktion: ${action.identifier}${version != null ? ` (v${version})` : ''}` },
        { id: placeholderId, role: 'assistant', content: 'In Arbeit...' },
      ]);
    }

    executeAction(action.app_id, action.identifier, inputs, files, version)
      .then(result => {
        setLastRunResult({
          appId: action.app_id,
          actionIdentifier: action.identifier,
          actionName: action.title || action.identifier,
          version: version ?? null,
          inputs,
          files,
          stdout: result.stdout,
          error: result.error,
          ts: Date.now(),
        });
        if (silent) return;
        if (result.error) focusChatOnError();
        setMessages(prev =>
          prev.map(m => m.id === placeholderId
            ? { ...m, ...(result.error
                // Test-runs of a historical version get no auto-fix button —
                // the fix agent edits the ACTIVE code, not the tested one
                ? (version != null
                    ? { content: execErrorUpdate(action, result.error, result.stdout).content }
                    : execErrorUpdate(action, result.error, result.stdout, inputs, files))
                : { content: result.stdout || '(no output)' }) }
            : m)
        );
      })
      .catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        setLastRunResult({
          appId: action.app_id,
          actionIdentifier: action.identifier,
          actionName: action.title || action.identifier,
          version: version ?? null,
          inputs,
          files,
          stdout: null,
          error: msg,
          ts: Date.now(),
        });
        if (silent) return;
        focusChatOnError();
        setMessages(prev =>
          prev.map(m =>
            m.id === placeholderId
              ? { ...m, content: `Fehler bei der Ausführung: ${msg}` }
              : m,
          )
        );
      })
      .finally(() => {
        chatLoadingRef.current = false;
        if (!silent) setChatLoading(false);
        setRunningActionId(null);
        void refreshActions();
        window.dispatchEvent(new Event('dashboard-refresh'));
      });
  }, [refreshActions, focusChatOnError]);

  // Version + silent flag pending between opening the input dialog and its
  // submit — set by runAction, consumed by submitActionInputs
  const pendingRunVersionRef = useRef<number | null>(null);
  const pendingRunSilentRef = useRef(false);

  const runAction = useCallback((action: Action, version?: number, opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    pendingRunVersionRef.current = version ?? null;
    pendingRunSilentRef.current = silent;
    const schema = action.metadata?.input_schema;
    if (!schema?.properties || Object.keys(schema.properties).length === 0) {
      executeAndReport(action, undefined, undefined, version, silent);
      return;
    }

    if (schema['x-preflight']) {
      // Two-phase: run preflight to get dynamic options
      if (chatLoadingRef.current) return;
      chatLoadingRef.current = true;
      if (!silent) setChatLoading(true);
      setRunningActionId(action.identifier);
      if (!silent) setChatOpen(true);

      const placeholderId = crypto.randomUUID();
      if (!silent) {
        setMessages(prev => [
          ...prev,
          { id: placeholderId, role: 'assistant', content: 'Wird vorbereitet...' },
        ]);
      }

      // Preflight runs the SAME version so the dialog options match the
      // code that will be tested
      executeAction(action.app_id, action.identifier, {}, undefined, version)
        .then(result => {
          setMessages(prev => prev.filter(m => m.id !== placeholderId));

          if (result.error) {
            setRunningActionId(null);
            if (silent) {
              // Drawer runs: the preflight error belongs to the output tab
              setLastRunResult({
                appId: action.app_id,
                actionIdentifier: action.identifier,
                actionName: action.title || action.identifier,
                version: version ?? null,
                inputs: {},
                stdout: result.stdout,
                error: result.error,
                ts: Date.now(),
              });
              return;
            }
            focusChatOnError();
            setMessages(prev => [
              ...prev,
              { id: crypto.randomUUID(), role: 'assistant', ...execErrorUpdate(action, result.error ?? '', result.stdout) },
            ]);
            return;
          }

          let options: Record<string, Array<{ value: string; label: string }>> | null = null;
          try {
            const parsed = JSON.parse(result.stdout || '');
            if (parsed._options && typeof parsed._options === 'object') {
              options = parsed._options;
            }
          } catch { /* not JSON — fall back to schema-only form */ }

          setInputFormOptions(options);
          setInputFormAction(action);
        })
        .catch(err => {
          setRunningActionId(null);
          const msg = err instanceof Error ? err.message : String(err);
          setMessages(prev => prev.filter(m => m.id !== placeholderId));
          if (silent) {
            setLastRunResult({
              appId: action.app_id,
              actionIdentifier: action.identifier,
              actionName: action.title || action.identifier,
              version: version ?? null,
              inputs: {},
              stdout: null,
              error: msg,
              ts: Date.now(),
            });
            return;
          }
          focusChatOnError();
          setMessages(prev => [
            ...prev,
            { id: crypto.randomUUID(), role: 'assistant', content: `Fehler bei der Ausführung: ${msg}` },
          ]);
        })
        .finally(() => {
          chatLoadingRef.current = false;
          if (!silent) setChatLoading(false);
        });
      return;
    }

    // No preflight: show form immediately
    setInputFormOptions(null);
    setInputFormAction(action);
  }, [executeAndReport, focusChatOnError]);

  const submitActionInputs = useCallback((action: Action, inputs: Record<string, unknown>, files: File[]) => {
    setInputFormAction(null);
    setInputFormOptions(null);
    executeAndReport(action, inputs, files.length > 0 ? files : undefined, pendingRunVersionRef.current ?? undefined, pendingRunSilentRef.current);
  }, [executeAndReport]);

  const cancelInputForm = useCallback(() => {
    pendingRunVersionRef.current = null;
    pendingRunSilentRef.current = false;
    setInputFormAction(null);
    setInputFormOptions(null);
    setRunningActionId(null);
  }, []);

  const [codeDrawerAction, setCodeDrawerAction] = useState<Action | null>(null);
  const [codeDrawerFocus, setCodeDrawerFocus] = useState<CodeDrawerFocus | null>(null);

  const openCodeDrawer = useCallback((action: Action, focus?: CodeDrawerFocus) => {
    // The Werkzeuge overview (if open) stays mounted beneath — the code
    // drawer stacks on top and ← returns to it, scroll position intact.
    setCodeDrawerFocus(focus ?? null);
    setCodeDrawerAction(action);
  }, []);

  const openCodeDrawerFor = useCallback((appId: string, identifier: string, focus?: CodeDrawerFocus) => {
    const action = actions.find(a => a.app_id === appId && a.identifier === identifier);
    if (action) openCodeDrawer(action, focus);
  }, [actions, openCodeDrawer]);

  const closeCodeDrawer = useCallback(() => {
    setCodeDrawerAction(null);
    setCodeDrawerFocus(null);
  }, []);

  // ← in the code drawer: one level up to the Werkzeuge overview — no matter
  // where the code view was opened from (overview, dashboard card, version
  // card in the chat). The card the user came from flashes briefly.
  const backToActions = useCallback(() => {
    if (codeDrawerAction) {
      setActionsHighlight({ appId: codeDrawerAction.app_id, identifier: codeDrawerAction.identifier });
    }
    setCodeDrawerAction(null);
    setCodeDrawerFocus(null);
    setActionsDrawerOpen(true);
  }, [codeDrawerAction]);

  // The dev-mode </> button opens the code drawer (used to dump the source
  // into the chat as a markdown message)
  const showActionCode = useCallback((action: Action) => {
    openCodeDrawer(action);
  }, [openCodeDrawer]);

  const appendVersionCard = useCallback((info: VersionInfo) => {
    setMessages(prev => [
      ...prev,
      { id: crypto.randomUUID(), role: 'assistant', content: '', versionInfo: info },
    ]);
  }, []);

  // The agent saved action code during a chat/fix turn: show a version card
  // in the chat, refresh the actions, and let an open code drawer jump to
  // the new version.
  const handleCodeChanged = useCallback((event: ActionCodeChangedEvent) => {
    appendVersionCard({
      appId: event.appId,
      actionIdentifier: event.action,
      version: event.version,
      summary: event.summary,
      origin: event.origin,
    });
    void refreshActions();
    window.dispatchEvent(new CustomEvent('action-code-changed', {
      detail: { appId: event.appId, identifier: event.action, version: event.version },
    }));
  }, [appendVersionCard, refreshActions]);

  const revertActionVersion = useCallback(async (appId: string, identifier: string, to: number, expectedCurrent?: number) => {
    const result = await revertActionApi(appId, identifier, to, expectedCurrent);
    if (!result.ok || !result.version) {
      setChatOpen(true);
      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: `**Wiederherstellen fehlgeschlagen:** ${result.error ?? ''}` },
      ]);
      return;
    }
    appendVersionCard({
      appId,
      actionIdentifier: identifier,
      version: result.version.v,
      summary: `Zurückgesetzt auf Version ${to}`,
      origin: 'revert',
    });
    void refreshActions();
    window.dispatchEvent(new Event('dashboard-refresh'));
    window.dispatchEvent(new CustomEvent('action-code-changed', {
      detail: { appId, identifier, version: result.version.v },
    }));
  }, [appendVersionCard, refreshActions]);

  const deleteActionFn = useCallback(async (action: Action) => {
    const confirmed = window.confirm(`Aktion löschen "${action.identifier}" (aus "${action.app_name}")?`);
    if (!confirmed) return;
    const result = await deleteActionApi(action.app_id, action.identifier);
    setChatOpen(true);
    if (result.error) {
      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: `**Fehler bei der Ausführung:** ${result.error}` },
      ]);
    } else {
      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: `Aktion gelöscht: \`${action.identifier}\` (aus \`${action.app_name}\`).` },
      ]);
      await refreshActions();
    }
  }, [refreshActions]);

  const deleteAppAttachmentFn = useCallback(async (file: FileAttachment) => {
    const confirmed = window.confirm(`Datei löschen "${file.filename}"?`);
    if (!confirmed) return;
    const result = await deleteAppAttachmentApi(file.app_id, file.identifier);
    if (result.error) {
      setChatOpen(true);
      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: `**Fehler bei der Ausführung:** ${result.error}` },
      ]);
    } else {
      await refreshActions();
    }
  }, [refreshActions]);

  const releaseFixContexts = useCallback((appId: string, actionIdentifier: string) => {
    setMessages(prev =>
      prev.map(m =>
        m.fixContext && m.fixContext.appId === appId && m.fixContext.actionIdentifier === actionIdentifier
          ? { ...m, fixContext: undefined }
          : m,
      )
    );
  }, []);

  const sendMessage = useCallback(async (text: string, image?: string, imageName?: string) => {
    if (chatLoadingRef.current) return;
    chatLoadingRef.current = true;
    setChatLoading(true);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      image: image ?? undefined,
      imageName: image ? imageName ?? undefined : undefined,
    };
    const assistantId = crypto.randomUUID();

    setMessages(prev => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '' },
    ]);

    try {
      const apiMessages = messages
        .concat(userMsg)
        .map(m => ({ role: m.role, content: m.content, image: m.image, imageName: m.imageName }));

      await agentChat(apiMessages, threadId, (delta) => {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId ? { ...m, content: m.content + delta } : m,
          )
        );
      }, (fixResult) => {
        // A fix pending on this thread verified during the chat turn.
        if (fixResult.success) releaseFixContexts(fixResult.appId, fixResult.action);
      }, {
        // Docked to the code drawer: the agent resolves "the code" to it
        activeAction: codeDrawerAction
          ? { app_id: codeDrawerAction.app_id, identifier: codeDrawerAction.identifier }
          : undefined,
        onCodeChanged: handleCodeChanged,
      });
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: `Fehler bei der Ausführung: ${err instanceof Error ? err.message : String(err)}` }
            : m,
        )
      );
    } finally {
      chatLoadingRef.current = false;
      setChatLoading(false);
      void refreshActions();
      window.dispatchEvent(new Event('dashboard-refresh'));
    }
  }, [messages, threadId, refreshActions, releaseFixContexts, codeDrawerAction, handleCodeChanged]);

  const startFix = useCallback(async (ctx: ExecErrorContext, sourceMessageId: string | null) => {
    if (chatLoadingRef.current) return;
    chatLoadingRef.current = true;
    setChatLoading(true);
    setFixingMessageId(sourceMessageId);

    // Fresh thread: the fix conversation replaces the current chat session,
    // so follow-up questions from the fix agent continue on the same thread.
    const fixThreadId = crypto.randomUUID();
    setThreadId(fixThreadId);
    const answerId = crypto.randomUUID();
    setMessages([
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `**Korrektur für \`${ctx.actionName}\`** — neue Chat-Sitzung für diese Korrektur gestartet.\n\`\`\`\n${ctx.errorText}\n\`\`\``,
      },
      { id: answerId, role: 'assistant', content: '' },
    ]);

    let answerText = '';
    try {
      const result = await fixAction(
        {
          appId: ctx.appId,
          actionIdentifier: ctx.actionIdentifier,
          threadId: fixThreadId,
          error: ctx.errorText,
          stdout: ctx.stdout,
          inputs: ctx.inputs,
          files: ctx.files,
        },
        (content) => {
          answerText += content;
          setMessages(prev =>
            prev.map(m => m.id === answerId ? { ...m, content: m.content + content } : m)
          );
        },
        handleCodeChanged,
      );
      if (result?.success) {
        // The agent's verified replay WAS the execution — nothing to re-run.
        void refreshActions();
        window.dispatchEvent(new Event('dashboard-refresh'));
      } else {
        // The status note goes BEFORE the agent's answer so a clarifying
        // question stays last and visible; the Auto-Fix button re-arms on
        // the answer itself (or on the note when the stream stayed empty).
        const note: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: result?.error
            ? `**Die Aktion schlägt weiterhin fehl:**\n\`\`\`\n${result.error}\n\`\`\``
            : '*Die Korrektur ist noch nicht bestätigt — deine ursprüngliche Eingabe bleibt erhalten.*',
          ...(answerText ? {} : { fixContext: ctx }),
        };
        setMessages(prev => {
          const armed = answerText
            ? prev.map(m => m.id === answerId ? { ...m, fixContext: ctx } : m)
            : prev;
          const idx = armed.findIndex(m => m.id === answerId);
          const at = idx === -1 ? armed.length : idx;
          return [...armed.slice(0, at), note, ...armed.slice(at)];
        });
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `**Korrektur-Anfrage fehlgeschlagen:** ${err instanceof Error ? err.message : String(err)}\n\n*Deine ursprüngliche Eingabe bleibt erhalten — du kannst es erneut versuchen.*`,
          fixContext: ctx,
        },
      ]);
    } finally {
      setFixingMessageId(null);
      chatLoadingRef.current = false;
      setChatLoading(false);
    }
  }, [refreshActions, handleCodeChanged]);

  const fixError = useCallback((messageId: string) => {
    const ctx = messages.find(m => m.id === messageId)?.fixContext;
    if (!ctx) return;
    void startFix(ctx, messageId);
  }, [messages, startFix]);

  // Auto-fix entry for the code drawer's output tab — only the ACTIVE
  // version's failures are fixable (the fix agent edits the active code)
  const fixLastRun = useCallback(() => {
    const run = lastRunResult;
    if (!run || !run.error || run.version != null) return;
    void startFix({
      actionName: run.actionName,
      actionIdentifier: run.actionIdentifier,
      appId: run.appId,
      errorText: run.error,
      stdout: run.stdout || undefined,
      inputs: run.inputs,
      files: run.files,
    }, null);
  }, [lastRunResult, startFix]);

  return (
    <ActionsContext.Provider
      value={{ actions, chatOpen, setChatOpen, messages, chatLoading, runningActionId, runAction, lastRunResult, sendMessage, fixError, fixLastRun, fixingMessageId, devMode, setDevMode, betaMode, setBetaMode, showActionCode, actionsDrawerOpen, openActionsDrawer, closeActionsDrawer, codeDrawerAction, codeDrawerFocus, openCodeDrawer, openCodeDrawerFor, closeCodeDrawer, backToActions, actionsHighlight, revertActionVersion, deleteAction: deleteActionFn, inputFormAction, inputFormOptions, submitActionInputs, cancelInputForm, files, filesByAction, downloadFile, deleteAppAttachment: deleteAppAttachmentFn }}
    >
      {children}
    </ActionsContext.Provider>
  );
}
