export function createSourceRevisionQaBot({ botId, competitorId, execution }) {
  if (!botId || !competitorId || !execution || execution.kind !== 'source-revision') {
    throw new Error('Invalid source-revision QA Bot fixture');
  }
  return {
    botId,
    player: 'A',
    // TournamentManager requires a non-empty command for the historical Bot
    // contract even when MatchRunner dispatches source-backed Bots through the
    // revision executor and never invokes this command.
    command: 'source-revision',
    args: [],
    execution,
  };
}

export function createSourceRevisionQaParticipationRequest({ botId, competitorId, execution }) {
  const botSnapshot = createSourceRevisionQaBot({ botId, competitorId, execution });
  return {
    competitorId,
    botId,
    participantName: competitorId,
    botSnapshot,
    revisionId: execution.revisionId,
    runtimeId: execution.runtimeId,
    sourceDigest: execution.sourceDigest,
    executionMode: execution.executionMode ?? 'raw',
    sdkVersion: execution.sdkVersion,
    sdkDigest: execution.sdkDigest,
  };
}
