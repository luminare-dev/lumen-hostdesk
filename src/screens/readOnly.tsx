import { useState } from 'react';

import { useApp } from '../state/AppProvider';
import { confirmWithDevice } from '../state/deviceAuth';
import { unlocksWrites } from '../state/servers';
import { ConfirmDialog, Notice } from '../ui/kit';

/**
 * Applies a change of the read-only settings. A change that allows writes which were blocked
 * asks the device owner first (biometrics or device code); where the device has neither, and on
 * the web, a dialog asks instead. Turning read-only on never asks.
 */
export function useReadOnlyChange() {
  const { t } = useApp();
  const [pending, setPending] = useState<{ title: string; apply: () => void }>();
  const [failed, setFailed] = useState(false);

  const request = async (before: boolean, after: boolean, title: string, apply: () => void) => {
    setFailed(false);
    if (!unlocksWrites(before, after)) {
      apply();
      return;
    }
    const result = await confirmWithDevice({ title: t('readOnly.authPrompt'), cancel: t('common.cancel') });
    if (result === 'ok') apply();
    else if (result === 'unavailable') setPending({ title, apply });
    else setFailed(true);
  };

  const ui = (
    <>
      {failed ? (
        <Notice tone="warning" testID="read-only-auth-failed">
          {t('readOnly.authFailed')}
        </Notice>
      ) : null}
      <ConfirmDialog
        visible={pending !== undefined}
        title={pending?.title ?? ''}
        body={t('readOnly.unlockBody')}
        confirmLabel={t('readOnly.allow')}
        onCancel={() => setPending(undefined)}
        onConfirm={() => {
          pending?.apply();
          setPending(undefined);
        }}
      />
    </>
  );
  return { request, ui };
}
