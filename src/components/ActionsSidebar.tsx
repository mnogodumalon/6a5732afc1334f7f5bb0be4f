import { IconBolt } from '@tabler/icons-react';
import { useActions } from '@/context/ActionsContext';
import { ActionsDrawer } from '@/components/ActionsDrawer';

const LABEL = 'Werkzeuge';

export function ActionsSidebar() {
  // The drawer's open state lives in the context so the code drawer can
  // navigate back to the overview (and errors can fold it away).
  const { actions, filesByAction, actionsDrawerOpen, openActionsDrawer, closeActionsDrawer } = useActions();

  const unassignedCount = filesByAction['__unassigned__']?.length ?? 0;
  const total = actions.length + (unassignedCount > 0 ? 1 : 0);
  // Always visible — an empty list shows the drawer's empty state with the
  // create-in-chat CTA instead of hiding the entry point entirely.

  return (
    <>
      <div className="px-3 pt-4">
        <button
          type="button"
          onClick={openActionsDrawer}
          className="flex items-center gap-2 px-4 py-2 w-full rounded-2xl text-base transition-colors min-w-0 text-sidebar-foreground font-normal hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
        >
          <IconBolt size={16} className="shrink-0 text-sidebar-foreground/70" />
          <span className="flex-1 truncate text-left">{LABEL}</span>
          {total > 0 && (
            <span className="shrink-0 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-sidebar-accent/60 text-[11px] font-medium text-sidebar-foreground">
              {total}
            </span>
          )}
        </button>
      </div>

      <ActionsDrawer open={actionsDrawerOpen} onClose={closeActionsDrawer} />
    </>
  );
}
