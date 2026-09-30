#!/usr/bin/env python3
"""Build the offline RS base-standards V0 contract from sealed source evidence."""
import argparse, hashlib, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA = ROOT / 'data/rs-base-standards-v0'
GENERATED = ['standards.json','matrix.json','fixtures.json','examples.json','decision.json','integrity.json']
CORE_KEYS = ['lot_area_min','lot_width_min','corner_lot_width_min','lot_depth_min','front_setback_min','interior_side_setback_min','street_side_setback_min','rear_setback_min','structure_height_max','density_basis','floor_area_ratio_max','lot_coverage_max','street_frontage_min']

def canonical(value): return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def digest(value): return hashlib.sha256((value.encode() if isinstance(value,str) else value)).hexdigest()
def load(path): return json.loads(path.read_text())
def write(path,value): path.write_text(json.dumps(value,indent=2,sort_keys=True,ensure_ascii=False)+'\n')
def norm(value): return ' '.join((value or '').split())

def spec(label):
    low=norm(label).lower()
    ordered=[
      ('max permitted density',('density_basis','dwelling_unit_per_lot','BASIS',['131.0431'])),
      ('min lot area',('lot_area_min','sq_ft','MIN',['131.0431'])),
      ('lot width (corner)',('corner_lot_width_min','ft','MIN',['131.0442'])),
      ('lot width (ft)',('lot_width_min','ft','MIN',['131.0442'])),
      ('street frontage',('street_frontage_min','ft','MIN',['131.0442(a)'])),
      ('lot depth',('lot_depth_min','ft','MIN',['131.0442'])),
      ('min front setback',('front_setback_min','ft','MIN',['131.0443(a)(1)','131.0443(i)'])),
      ('min side setback',('interior_side_setback_min','ft','MIN',['131.0443(a)(4)','131.0443(i)'])),
      ('min street side setback',('street_side_setback_min','ft','MIN',['131.0443(a)(4)','131.0443(i)'])),
      ('min rear setback',('rear_setback_min','ft','MIN',['131.0443(a)(2)','131.0443(a)(3)','131.0443(i)'])),
      ('setback requirements for resubdivided',('resubdivided_corner_lot_setbacks',None,'REFERENCE',['113.0246(f)','131.0443'])),
      ('max structure height',('structure_height_max','ft','MAX',['131.0444','131-04H'])),
      ('lot coverage for sloping lots',('lot_coverage_max','percent','MAX',['131.0445(a)'])),
      ('max floor area ratio',('floor_area_ratio_max','ratio','MAX',['131.0446'])),
      ('max paving/ hardscape',('paving_hardscape_max','percent','MAX',['131.0447'])),
      ('accessory uses and structures',('accessory_uses_structures',None,'REFERENCE',['131.0448','141.0307'])),
      ('garage regulations',('garage_regulations',None,'REFERENCE',['131.0449(a)'])),
      ('building spacing',('building_spacing',None,'REFERENCE',['131.0450'])),
      ('max third story dimensions',('third_story_dimensions_max',None,'REFERENCE',['131.0460'])),
      ('architectural projections',('architectural_projections_encroachments',None,'REFERENCE',['131.0461(a)'])),
      ('supplemental requirements',('supplemental_requirements',None,'REFERENCE',['131.0464(a)'])),
      ('bedroom regulation',('bedroom_regulation',None,'REFERENCE',['131-04D:8'])),
      ('refuse and recyclable',('refuse_recycling_storage',None,'REFERENCE',['142.0805'])),
      ('visibility area',('visibility_area',None,'REFERENCE',['113.0273'])),
      ('dwelling unit protection',('dwelling_unit_protection',None,'REFERENCE',['Chapter 14, Article 3, Division 12']))]
    for prefix,result in ordered:
        if prefix in low: return result
    raise ValueError(f'Unsupported source row: {label!r}')

def footnote_numbers(label,cell):
    return sorted({int(x) for x in re.findall(r'\((\d+)\)',f'{label} {cell or ""}')})

def parse_value(cell,targets):
    clean=norm(re.sub(r'\(\d+\)','',cell or ''))
    compact=clean.replace(' ','').lower()
    if re.fullmatch(r'\d+(?:,\d{3})*(?:\.\d+)?',clean):
        return {'kind':'number','number':float(clean.replace(',',''))}
    if clean == '24/30':
        return {'kind':'source_expression','text':'24/30','evaluated':False}
    if compact == 'varies':
        return {'kind':'reference','text':'varies','targets':['131.0446(a)','131-04J']}
    if compact == 'applies':
        return {'kind':'reference','text':'applies','targets':targets}
    if clean in ['-','--','']:
        return {'kind':'unknown','source_symbol':clean or None,'reason':'No scalar standard is supplied by this table cell.'}
    raise ValueError(f'Unsupported source cell: {cell!r}')

def conditions(key,zone,notes,footnotes):
    out=[]
    for n in notes:
        f=footnotes[f'131-04D:{n}']
        out.append(f['text'] if f['text'] else f['note'])
    if key == 'corner_lot_width_min': out.append('Applies only when the lot is a corner lot.')
    if key == 'street_frontage_min': out.append('Section 131.0442(a) may reduce frontage to 60 percent on qualifying turnaround or curving streets.')
    if key in {'front_setback_min','interior_side_setback_min','street_side_setback_min','rear_setback_min'}:
        out.append('Section 131.0443 conditions and measurement rules must be evaluated before treating the printed number as a final parcel setback.')
        out.append('Outside Coastal, section 131.0443(i) permits the Fire Code Official to require a greater defensible-space buffer.')
    if key == 'structure_height_max': out.append('Section 131.0444 and Table 131-04H angled-building-envelope rules remain unevaluated.')
    if key == 'lot_coverage_max': out.append('Section 131.0445(a) applies only where more than 50 percent of the premises contains steep hillsides; the section states 50 percent maximum coverage.')
    if key == 'floor_area_ratio_max' and zone in {f'RS-1-{i}' for i in range(2,8)}:
        out.append('The source says varies; section 131.0446(a) and Table 131-04J require lot-area and steep-hillside facts.')
    if key == 'resubdivided_corner_lot_setbacks': out.append('Requires the parcel and subdivision facts in section 113.0246(f).')
    if key == 'density_basis': out.append('One dwelling unit per lot is a base-table basis, not a project-level capacity conclusion.')
    return list(dict.fromkeys(out))

def build(data_dir,out_dir):
    source=load(data_dir/'sources.json'); versions=load(data_dir/'versions.json')
    domain=load(data_dir/'zone-domain.json'); table=load(data_dir/'source-table.json')
    footnotes=load(data_dir/'footnotes.json')
    sem=digest(canonical({k:v['rows'] for k,v in table['pages'].items()}))
    if sem != table['semantic_sha256']: raise ValueError('source-table semantic hash mismatch')
    expected_source=source['sources']['residential_division_4']['sha256']
    if table['source_sha256'] != expected_source: raise ValueError('source identity mismatch')
    rules=[]
    for p in [33,34,35]:
        page=table['pages'][str(p)]; rows=page['rows']; boxes=page['boxes']
        codes=[f"RS-1-{rows[3][c]}" for c in range(2,len(rows[3]))]
        for row_index,row in enumerate(rows[4:],4):
            label=row[0] or ''
            if norm(label).lower() in {'min lot dimensions','setback requirements'}: continue
            key,unit,operator,deps=spec(label)
            for col,zone in enumerate(codes,2):
                cell=row[col]
                note_nums=footnote_numbers(label,cell)
                targets=list(dict.fromkeys(deps+[f'131-04D:{n}' for n in note_nums]))
                value=parse_value(cell,targets)
                condition=conditions(key,zone,note_nums,footnotes)
                if value['kind']=='unknown': fact_state='UNKNOWN'
                elif value['kind'] in {'reference','source_expression'} or condition and key != 'density_basis': fact_state='CONDITIONAL'
                else: fact_state='RECORDED'
                evidence={'source_sha256':expected_source,'source_edition':'9-2026','page':p,'page_text_sha256':page['text_sha256'],'row':row_index,'column':col,'row_label':label,'zone_header':zone,'cell_text':cell,'bbox':boxes[row_index][col]}
                rule={
                  'rule_id':f"{versions['rule_set_version']}:{zone}:{p}:{row_index}",
                  'rule_set_version':versions['rule_set_version'],'zone_code':zone,'standard_key':key,
                  'value':value,'unit':unit,'operator':operator,'fact_state':fact_state,
                  'derivation_class':'NORMALIZED_SOURCE_EXPRESSION' if value['kind']=='source_expression' else 'SOURCE_TRANSCRIPTION',
                  'condition':condition,'exceptions':[f'131-04D:{n}' for n in note_nums],
                  'source_document':'San Diego Municipal Code Chapter 13, Article 1, Division 4',
                  'source_section':'131.0431(a)','source_table':'131-04D','source_page':p,
                  'source_url':source['sources']['residential_division_4']['url'],'source_evidence':evidence,
                  'effective_from':None,'effective_to':None,'effective_date_basis':'Current composite selected by versions.json; each provision retains its own section history.',
                  'jurisdiction_variant':'OUTSIDE_COASTAL','unresolved_dependencies':targets,
                  'notes':['Recorded base-zone evidence only; no parcel compliance or development-capacity conclusion.']}
                rule['provenance_sha256']=digest(canonical({k:v for k,v in rule.items() if k!='provenance_sha256'}))
                rules.append(rule)
    rules.sort(key=lambda r:(int(r['zone_code'].split('-')[-1]),r['source_page'],r['source_evidence']['row']))
    zones=[z['zone_code'] for z in domain['zones']]
    if len(rules)!=343 or {r['zone_code'] for r in rules}!=set(zones): raise ValueError('RS table coverage mismatch')
    out_dir.mkdir(parents=True,exist_ok=True)
    write(out_dir/'standards.json',rules)
    by={(r['zone_code'],r['standard_key']):r for r in rules}
    matrix=[]
    for zone in zones:
        cells={}
        for key in CORE_KEYS:
            r=by[(zone,key)]
            cells[key]={'fact_state':r['fact_state'],'value':r['value'],'unit':r['unit'],'source_page':r['source_page'],'rule_id':r['rule_id']}
        matrix.append({'zone_code':zone,'cells':cells,'other':{
          'paving_hardscape':by[(zone,'paving_hardscape_max')]['fact_state'],
          'third_story_dimensions':by[(zone,'third_story_dimensions_max')]['fact_state'],
          'resubdivided_corner_lot_setbacks':by[(zone,'resubdivided_corner_lot_setbacks')]['fact_state'],
          'bedroom_regulation':by[(zone,'bedroom_regulation')]['fact_state'] if (zone,'bedroom_regulation') in by else 'NOT_APPLICABLE'}})
    write(out_dir/'matrix.json',matrix)
    zone_fixtures=[]
    for zone in zones:
        selected={k:{'value':by[(zone,k)]['value'],'fact_state':by[(zone,k)]['fact_state'],'condition':by[(zone,k)]['condition']} for k in CORE_KEYS}
        zone_fixtures.append({'zone_code':zone,'core_values_sha256':digest(canonical(selected)),'rule_count':len([r for r in rules if r['zone_code']==zone])})
    fixtures={'zones':zone_fixtures,
      'rs_1_7':{'lot_width_min':50,'corner_lot_width_min':55,'lot_depth_min':95,'lot_area_min':5000,'density_basis':1},
      'corner_lot':{'zone_code':'RS-1-7','standard_key':'corner_lot_width_min','condition_required':True},
      'setback_footnote':{'zone_code':'RS-1-7','standard_key':'front_setback_min','footnote':'131-04D:1'},
      'height_exception':{'zone_code':'RS-1-7','standard_key':'structure_height_max','source_expression':'24/30'},
      'coastal':{'outside':'SUPPORTED','inside':'APPLICABILITY_UNRESOLVED','unknown':'APPLICABILITY_UNRESOLVED'},
      'unknown_standard':{'zones':['RS-1-8','RS-1-9','RS-1-10','RS-1-11','RS-1-12','RS-1-13','RS-1-14'],'standard_key':'bedroom_regulation','fact_state':'UNKNOWN'},
      'unsupported_zone':'RS-1-999'}
    write(out_dir/'fixtures.json',fixtures)
    def result(state,zs): return {'mapping_state':state,'zone_codes':zs,'capacity_calculated':False}
    examples=[
      {**result('SINGLE_ZONE',['RS-1-7']),'name':'ordinary RS-1-7','standards':[{'zone_code':'RS-1-7','state':'SUPPORTED','rule_count':24}],'unresolved':['parcel-specific conditions remain unevaluated']},
      {**result('SINGLE_ZONE',['RS-1-1']),'name':'another RS zone','standards':[{'zone_code':'RS-1-1','state':'SUPPORTED','rule_count':24}]},
      {**result('BOUNDARY_SLIVER',['RS-1-7','RM-1-1']),'name':'boundary sliver','primary_standards':[{'zone_code':'RS-1-7','state':'SUPPORTED'}],'secondary_zoning_evidence':['RM-1-1'],'blended':False},
      {**result('SPLIT_ZONE',['RS-1-7','RM-1-1']),'name':'split RS plus non-RS','standards':[{'zone_code':'RS-1-7','state':'SUPPORTED'},{'zone_code':'RM-1-1','state':'UNSUPPORTED_BY_RS_V0'}],'blended':False},
      {**result('AMBIGUOUS',['RS-1-7','RS-1-4']),'name':'ambiguous parcel','standards':[],'state':'NO_DEFINITIVE_STANDARD_SET'},
      {**result('UNMAPPED',[]),'name':'unmapped parcel','standards':[],'state':'NO_ZONE_STANDARDS'},
      {**result('SINGLE_ZONE',['RS-1-7']),'name':'unknown Coastal context','coastal_context':'unknown','standards':[],'state':'APPLICABILITY_UNRESOLVED'}]
    write(out_dir/'examples.json',examples)
    states={s:sum(1 for row in matrix for cell in row['cells'].values() if cell['fact_state']==s) for s in ['RECORDED','CONDITIONAL','UNKNOWN','NOT_APPLICABLE']}
    decision={'decision':'RS_BASE_STANDARDS_V0_SOURCE_COMPLETE','scope':'City of San Diego RS base-zone source contract; outside-Coastal current profile supported; inside/unknown fail closed.',
      'rule_set_version':versions['rule_set_version'],'zones':14,'rules':len(rules),'matrix_expected_cells':len(zones)*len(CORE_KEYS),
      'matrix_states':states,'supported_values_without_provenance':0,'coastal_profiles':{p['coastal_context']:p['state'] for p in versions['profiles']},
      'runtime_wiring':False,'capacity_logic':False}
    write(out_dir/'decision.json',decision)
    hash_names=['sources.json','versions.json','zone-domain.json','rule-schema.json','source-table.json','source-excerpts.json','footnotes.json','standards.json','matrix.json','fixtures.json','examples.json','decision.json']
    integrity={name:digest((out_dir/name).read_bytes() if (out_dir/name).exists() else (data_dir/name).read_bytes()) for name in hash_names}
    write(out_dir/'integrity.json',{'algorithm':'sha256','files':integrity})
    return {'rules':len(rules),'zones':len(zones),'matrix_states':states}

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--data-dir',type=Path,default=DEFAULT_DATA); parser.add_argument('--output-dir',type=Path)
    args=parser.parse_args(); out=args.output_dir or args.data_dir
    print(json.dumps(build(args.data_dir,out),sort_keys=True))
if __name__=='__main__': main()
