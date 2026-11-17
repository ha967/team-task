import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { ListTeamsQueryDto } from './dto/list-teams-query.dto.js';
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
}
