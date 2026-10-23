import {isDeepStrictEqual} from 'node:util';
import {DataTransport,TransportError} from '../git/data-transport.js';
import type {RepositoryContext} from '../git/context.js';
import type {BoundRemote} from '../git/remote-binding.js';
import type {LocalStore,TransportState} from '../storage/store.js';

/** Explicit setup only. Neither sync nor provider automation calls this transition. */
export async function rebindAcceptedRemote(options:{repository:RepositoryContext;store:LocalStore;binding:BoundRemote;expected:TransportState;signal:AbortSignal;deadline:number}):Promise<void>{
  const {store,binding,expected}=options;
  await store.withLock(options.signal,async()=>{
    if(!expected.commit||binding.repositoryId!==expected.repositoryId||binding.dataRef!==expected.dataRef||binding.canonicalPushUrl===expected.canonicalPushUrl||!isDeepStrictEqual(await store.transportState(),expected))throw new TransportError('routing-changed');
    const transport=await DataTransport.open({...options,indexMode:'full',priorCommit:expected.commit});
    try{
      if(!await transport.remoteTip())throw new TransportError('history-rewritten');
      const accepted=await transport.fetch();
      if(accepted.meta.repositoryId!==expected.repositoryId)throw new TransportError('history-rewritten');
      await transport.assertDescendant(accepted.commit,expected.commit,accepted.artifacts);
      await transport.verifyRoute();options.signal.throwIfAborted();
      await transport.anchor(accepted.commit);
      await store.rebindAcceptedLedger(expected,{...expected,canonicalPushUrl:binding.canonicalPushUrl,commit:accepted.commit});
    }finally{await transport.closeCache();await transport.close();}
  });
}
