(async()=>{
  const ExcelJS = require('exceljs');
  const fs = require('fs');
  const path = require('path');
  const base='http://localhost:3000';
  const now=new Date();
  const next=new Date(now.getTime()+10*24*3600*1000).toISOString();
  try{
    // create instrument with calibration due in 10 days
    let res = await fetch(base+'/api/instruments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'E2E Cal Test', model:'E2E-1', brand:'E2E', serial:'E2E-001', category:'Test', location:'warehouse', productOverview:'E2E overview', specifications:'specs', nextCalibrationDate: next, productImages:['/images/test.png'], userManualUrl:'/uploads/manual.pdf'})});
    console.log('create status', res.status);
    let j = await res.json(); console.log('create json',j);

    // fetch all instruments
    res = await fetch(base+'/api/instruments');
    const inst = await res.json();
    console.log('instruments', inst.length);
    const newInst = inst.find(i=>i.name==='E2E Cal Test');
    if(!newInst){ console.error('new instrument not found'); process.exit(2); }
    // pick first and new one
    const ids = [inst[0].id, newInst.id];
    console.log('booking ids', ids);
    res = await fetch(base+'/api/book/bulk',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'Dk0II5a6',instrumentIds: ids, days:5, remarks:'e2e test'})});
    j = await res.json(); console.log('book result', j);
    if(j.sheet){
      const filename = path.basename(j.sheet);
      const fp = path.join(__dirname,'public',filename);
      console.log('file exists', fs.existsSync(fp), fp);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(fp);
      console.log('sheets', wb.worksheets.map(s=>s.name));
      const cal = wb.getWorksheet('CalibrationDue');
      if(cal){
        console.log('CalibrationDue rows:', cal.rowCount);
        cal.eachRow((r,i)=>console.log(i, r.values));
      } else {
        console.log('No CalibrationDue sheet');
      }
    } else {
      console.log('No sheet returned');
    }
    process.exit(0);
  }catch(e){ console.error('error',e); process.exit(1); }
})();
