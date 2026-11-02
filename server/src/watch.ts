/** Seconds each signed-in Twitch account has spent inside each theatre, counted by the server, so quests can be checked. */
const watched=new Map<string,Map<string,number>>();
export function addWatch(userId:string,channel:string,seconds:number){
  let rooms=watched.get(userId);if(!rooms){rooms=new Map();watched.set(userId,rooms)}
  rooms.set(channel,(rooms.get(channel)??0)+seconds);
}
export const watchTotals=(userId:string)=>Object.fromEntries(watched.get(userId)??[]);
