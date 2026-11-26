import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { InviteTeamMemberDto } from './dto/invite-team-member.dto.js';
import { ListTeamsQueryDto } from './dto/list-teams-query.dto.js';
import { UpdateTeamMemberRoleDto } from './dto/update-team-member-role.dto.js';
import { TeamsService } from './teams.service.js';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  getTeams(
    @Query() query: ListTeamsQueryDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.teamsService.getTeams(query, userId);
  }

  @Get(':teamId')
  getTeamDetail(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.teamsService.getTeamDetail(teamId, userId);
  }

  @Post()
  addTeam(@CurrentUser('sub') userId: string, @Body() body: CreateTeamDto) {
    return this.teamsService.addTeam(userId, body);
  }

  @Post(':teamId/members')
  inviteMember(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @CurrentUser('sub') userId: string,
    @Body() body: InviteTeamMemberDto,
  ) {
    return this.teamsService.inviteMember(teamId, userId, body);
  }

  @Patch(':teamId/members/:userId')
  updateMemberRole(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser('sub') userId: string,
    @Body() body: UpdateTeamMemberRoleDto,
  ) {
    return this.teamsService.updateMemberRole(
      teamId,
      userId,
      targetUserId,
      body,
    );
  }

  // userId 等于当前登录用户即「退出团队」，不另开 /leave 端点
  @Delete(':teamId/members/:userId')
  removeMember(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.teamsService.removeMember(teamId, userId, targetUserId);
  }
}
