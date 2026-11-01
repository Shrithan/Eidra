import type { World } from './worlds'
export default function WorldPicker({world,onChange,worlds}:{world:string;onChange:(id:string)=>void;worlds:World[]}){
 return <nav className="ww-world-picker" aria-label="World navigation">
   <label htmlFor="ww-world">Explore</label>
   <select id="ww-world" value={world} onChange={e=>onChange(e.target.value)}>
     <option value="earth">Earth · public locations & demos</option>
     {worlds.map(w=><option key={w.id} value={w.id}>{w.name} · {w.count.toLocaleString()}</option>)}
   </select>
   <small>{world==='earth'?'City/country locations are approximate.': 'A fictional genre world. Pins do not reveal real locations.'}</small>
 </nav>
}
