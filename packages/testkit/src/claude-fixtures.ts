/** Native-shaped synthetic row; all amounts remain uncertified private snapshots. */
export function claudeNativeResponse(id='synthetic-response',input=100,output=3) {
  return {type:'assistant',uuid:`entry-${id}`,sessionId:'synthetic-session',requestId:`request-${id}`,
    cwd:'/synthetic/repo',version:'2.1.307',message:{id,model:'claude-sonnet-4-6',stop_reason:'end_turn',content:[],
      usage:{input_tokens:input,output_tokens:output,cache_read_input_tokens:0,cache_creation_input_tokens:0}}};
}

/** Explicitly certified normalized IMPORT fixture, never evidence of CLI numerical finality. */
export function certifiedClaudeImport(id='original',total=100,model:'claude-sonnet-4-6'|'gpt-5.4-mini'='claude-sonnet-4-6') {
  return {schemaVersion:2 as const,normalizationVersion:1 as const,provider:'import' as const,representation:'request' as const,
    identity:'provider-native' as const,coverage:'native-request' as const,nativeUnitId:id,nativeCoverageId:id,revision:{kind:'final' as const},
    supersedes:[],quality:'exact' as const,execution:{cwd:'/synthetic/repo',repositoryId:null,remoteUrl:null},
    source:{instanceKey:'synthetic-certified-import',sourceIdentity:'synthetic-certified-import',generation:'1',sourceSchema:'certified-normalized-import-fixture',readerVersion:'1'},
    lineage:{kind:'root' as const,parentNativeId:null,inherited:'none' as const},diagnostics:[],
    meters:[{vendor:model==='claude-sonnet-4-6'?'anthropic' as const:'openai' as const,model,total,input:total,uncachedInput:total,cachedInput:0,
      cacheCreation:{fiveMinutes:0,oneHour:0,other:0},output:0,reasoningOutput:0,toolInput:0,
      semantics:{input:'excludes-cached' as const,output:'includes-reasoning' as const,cacheCreation:'separate' as const,total:'input-plus-output' as const,toolInput:'included-in-input' as const}}]};
}
