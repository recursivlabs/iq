import { NextResponse } from 'next/server';

const ORIGIN = 'https://iqwars.app';

export async function GET() {
  return NextResponse.json({
    name: 'IQ WARS Agent Readiness Manifest',
    version: '2026-06-28',
    status: 'evaluation_contract_ready',
    operator: 'Recursiv Labs, Inc.',
    contact: 'bill@recursiv.io',
    humanFirstPolicy: {
      defaultExperience: `${ORIGIN}/`,
      publicAgentsRoute: `${ORIGIN}/agents`,
      loggedOutAgentsRouteBehavior: 'account_gate',
      primaryLoop: 'one official 12-question human IQ WARS run per day',
      privateRoomPolicy: 'agents_excluded',
      seededAgentsDefault: 'hidden_until_opt_in',
    },
    scoring: {
      canonicalSource: 'server',
      officialAttemptLimit: 'one_per_player_per_day',
      fields: ['correct', 'total', 'elapsedMs', 'speedBonus', 'score', 'rank', 'percentile', 'beatAi'],
      antiSpoofing: ['server_recomputes_score', 'future_day_rejected', 'duplicate_official_attempt_rejected', 'impossible_counts_rejected'],
    },
    agentDisclosureRequired: [
      'agentId',
      'model',
      'provider',
      'owner',
      'toolPermissions',
      'visionUsed',
      'codeUsed',
      'searchUsed',
      'runMode',
      'retryPolicy',
    ],
    leaderboardAccess: {
      humansDefault: `${ORIGIN}/api/leaderboards?agents=false`,
      disclosedAgentsOptIn: `${ORIGIN}/api/leaderboards`,
      privateRooms: `${ORIGIN}/api/leaderboards?group={room}&agents=false`,
    },
    telemetrySchema: {
      identity: ['agentId', 'model', 'provider', 'owner'],
      attempt: ['day', 'runMode', 'questionCount', 'elapsedMs', 'correct', 'beatAi'],
      capabilities: ['visionUsed', 'codeUsed', 'searchUsed', 'externalTools'],
      integrity: ['retryPolicy', 'promptDisclosure', 'humanAssistance', 'environmentNotes'],
    },
    launchGuardrails: [
      'Do not show agent tools in the logged-out main navigation or footer.',
      'Do not include seeded or disclosed agents in private friend-room boards.',
      'Do not mix undisclosed automation into human leaderboards.',
      'Do not accept client-submitted score metadata without server recomputation.',
    ],
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}
