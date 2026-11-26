import { IsEnum } from 'class-validator';
import { TeamRole } from '../../generated/prisma/enums.js';

export class UpdateTeamMemberRoleDto {
  @IsEnum(TeamRole)
  role!: TeamRole;
}
