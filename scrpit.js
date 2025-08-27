document.getElementById("revenueForm").addEventListener("submit", function(e) {
  e.preventDefault();

  const roomsAvailable = +document.getElementById("roomsAvailable").value;
  const roomsSold = +document.getElementById("roomsSold").value;
  const yourRate = +document.getElementById("yourRate").value;

  const roomRevenue = roomsSold * yourRate;
  const adr = roomsSold ? (roomRevenue / roomsSold).toFixed(2) : 0;
  const revpar = roomsAvailable ? (roomRevenue / roomsAvailable).toFixed(2) : 0;
  const occupancy = roomsAvailable ? ((roomsSold / roomsAvailable) * 100).toFixed(2) : 0;

  const resultsHTML = `
    <h3>Revenue Metrics</h3>
    <p>Room Revenue: $${roomRevenue}</p>
    <p>ADR (Average Daily Rate): $${adr}</p>
    <p>RevPAR (Revenue per Available Room): $${revpar}</p>
    <p>Occupancy Rate: ${occupancy}%</p>
  `;

  document.getElementById("results").innerHTML = resultsHTML;
});

document.getElementById("copyAll").addEventListener("click", () => {
  navigator.clipboard.writeText(document.getElementById("results").innerText);
  alert("Results copied!");
});
