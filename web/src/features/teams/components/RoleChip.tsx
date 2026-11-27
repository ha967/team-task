import { ROLE_LABELS, ROLE_TONES } from '../constants';
import type { TeamRole } from '../types';

export function RoleChip({ role }: { role: TeamRole }) {
  return (
    <span className={`chip ${ROLE_TONES[role]}`}>{ROLE_LABELS[role]}</span>
  );
}
