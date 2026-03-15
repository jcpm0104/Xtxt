// ===============================
// TRADE GUARDIAN ENGINE
// Core Rule Enforcement System
// ===============================

const GuardianEngine = {

plan: {},
positions: [],
stats: {
dailyLoss: 0,
tradesToday: 0,
consecutiveLosses: 0
},

init(){

this.loadPlan()
this.startMonitoring()

},

// ===============================
// LOAD PLAN
// ===============================

loadPlan(){

const keys = [
"tradeGuardianActivePlan",
"tradeGuardianSelectedPlan",
"tradeGuardianCustomPlan"
]

for(const key of keys){

const value = JSON.parse(localStorage.getItem(key) || "{}")

if(value && Object.keys(value).length){

this.plan = value
console.log("Guardian loaded plan from:", key)
break

}

}

},

// ===============================
// POSITION UPDATE
// ===============================

updatePositions(positions){

this.positions = positions
this.evaluate()

},

// ===============================
// UPDATE STATS
// ===============================

updateStats(stats){

this.stats = {...this.stats,...stats}
this.evaluate()

},

// ===============================
// MAIN EVALUATION
// ===============================

evaluate(){

const alerts = []

// ---------- DAILY LOSS ----------

if(this.plan.personalDailyRiskLimit){

const limit = this.plan.personalDailyRiskLimit.value

if(this.stats.dailyLoss >= limit){

alerts.push({
type:"CRITICAL",
message:"Daily loss limit reached"
})

}

}

// ---------- MAX TRADES ----------

if(this.plan.maxTradesPerDay){

if(this.stats.tradesToday > this.plan.maxTradesPerDay){

alerts.push({
type:"WARNING",
message:"Maximum trades per day exceeded"
})

}

}

// ---------- CONSECUTIVE LOSSES ----------

if(this.plan.maxConsecutiveLosingTrades){

if(this.stats.consecutiveLosses >= this.plan.maxConsecutiveLosingTrades){

alerts.push({
type:"CRITICAL",
message:"Too many consecutive losses"
})

}

}

// ---------- POSITION RISK ----------

if(this.plan.maxTotalRiskAcrossOpenTrades){

const risk = this.calculateTotalRisk()

if(risk > this.plan.maxTotalRiskAcrossOpenTrades.value){

alerts.push({
type:"WARNING",
message:"Total open risk exceeds allowed limit"
})

}

}

// ---------- RESULT ----------

this.updateDashboard(alerts)

},

// ===============================
// RISK CALCULATION
// ===============================

calculateTotalRisk(){

let total = 0

this.positions.forEach(pos=>{

total += pos.risk || 0

})

return total

},

// ===============================
// DASHBOARD UPDATE
// ===============================

updateDashboard(alerts){

const statusEl = document.getElementById("guardianStatusValue")
const reasonEl = document.getElementById("guardianReasonValue")
const actionEl = document.getElementById("guardianActionValue")

if(!statusEl) return

if(alerts.length === 0){

statusEl.textContent = "ACTIVE"
reasonEl.textContent = "All rules respected"
actionEl.textContent = "Trading allowed"

return

}

const critical = alerts.find(a=>a.type==="CRITICAL")

if(critical){

statusEl.textContent = "LOCKED"
reasonEl.textContent = critical.message
actionEl.textContent = "Stop trading"

}else{

statusEl.textContent = "WARNING"
reasonEl.textContent = alerts[0].message
actionEl.textContent = "Proceed with caution"

}

this.renderAlerts(alerts)

},

// ===============================
// ALERT RENDER
// ===============================

renderAlerts(alerts){

const list = document.getElementById("alertList")

if(!list) return

list.innerHTML=""

alerts.forEach(alert=>{

const div = document.createElement("div")

div.className="alert"

div.textContent = alert.message

list.appendChild(div)

})

},

// ===============================
// AUTO MONITOR
// ===============================

startMonitoring(){

setInterval(()=>{

this.evaluate()

},3000)

}

}

// ===============================
// START ENGINE
// ===============================

window.addEventListener("DOMContentLoaded",()=>{

GuardianEngine.init()

})
