export function toLineChartData(labels, datasets) {
  return {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        borderColor: ds.color || getColor(i),
        backgroundColor: ds.fill ? (ds.color || getColor(i)) + '33' : 'transparent',
        fill: ds.fill || false,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } }
      },
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { stepSize: 20 } }
      }
    }
  };
}

export function toBarChartData(labels, datasets) {
  return {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: ds.color || getColor(i),
        borderRadius: 4
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1, position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } }
      },
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { stepSize: 20 } }
      }
    }
  };
}

export function toDoughnutData(labels, values, colors) {
  return {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors || labels.map((_, i) => getColor(i)),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } }
      }
    }
  };
}

export function toHorizontalBarData(labels, datasets) {
  return {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: ds.color || getColor(i),
        borderRadius: 4,
        barPercentage: 0.7
      }))
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1, position: 'bottom' }
      },
      scales: {
        x: { beginAtZero: true, max: 100 }
      }
    }
  };
}

const COLORS = ['#226b63', '#be7c2f', '#1d7a3e', '#9f1d1d', '#5b4b8a', '#2e7d9e', '#d46a1f', '#6b8e23'];

function getColor(index) {
  return COLORS[index % COLORS.length];
}
