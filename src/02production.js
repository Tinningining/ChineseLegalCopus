import * as d3 from "d3";

function production(data, source, {

  barHeight = 25,
  marginTop = 20,
  marginRight = 100,
  marginBottom = 20,
  marginLeft = 40,
  width = 800,
  height = Math.ceil((12 + 0.1) * barHeight) + marginTop + marginBottom
} = {}) {

  var ex;
  for (var i = 0; i < 30; i++) {
    for (var j = 29; j >= i; j--) {
      if (source == 1) {
        if (+data[j].原煤生产量 < +data[j + 1].原煤生产量) {
          ex = data[j];
          data[j] = data[j + 1];
          data[j + 1] = ex;
        }
      }
      else if (source == 2) {
        if (+data[j].原油生产量 < +data[j + 1].原油生产量) {
          ex = data[j];
          data[j] = data[j + 1];
          data[j + 1] = ex;
        }
      }
      else if (source == 3) {
        if (+data[j].天然气生产量 < +data[j + 1].天然气生产量) {
          ex = data[j];
          data[j] = data[j + 1];
          data[j + 1] = ex;
        }
      }
      else if (source == 4) {
        if (+data[j].发电量 < +data[j + 1].发电量) {
          ex = data[j];
          data[j] = data[j + 1];
          data[j + 1] = ex;
        }
      }
    }
  }
  //切割数据，取前12个
  data = data.slice(0, 12);

  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => {
      if (source == 1) return 130000;
      else if (source == 2) return 4000;
      else if (source == 3) return 550;
      else if (source == 4) return 6500;
    }
    )])
    .range([marginLeft, width - marginRight]);

  const y = d3.scaleBand()
    .domain(d3.sort(data, d => -d.frequency).map(d => d.地区))
    .rangeRound([marginTop, height - marginBottom])
    .padding(0.1);


  // Create the SVG container.
  const svg = d3.select("#svg2")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("style", " height: 600; font: 10px sans-serif");

  // Append a rect for each letter.
  svg.append("g")
    .attr("fill", d => {
      if (source == 1) return "#D7191C";
      else if (source == 2) return "#2B83BA";
      else if (source == 3) return "#FDAE61";
      else if (source == 4) return "#ABDDA4";
    })
    .selectAll()
    .data(data)
    .join("rect")
    .attr("x", x(0))
    .attr("y", (d) => y(d.地区))
    .attr("width", (d) => {
      if (source == 1) return x(d.原煤生产量) - x(0);
      else if (source == 2) return x(d.原油生产量) - x(0);
      else if (source == 3) return x(d.天然气生产量) - x(0);
      else if (source == 4) return x(d.发电量) - x(0);
      // return x(d.原煤生产量) - x(0);
    })
    .attr("height", y.bandwidth());


  // Create the axes.
  svg.append("g")
    .attr("transform", `translate(0,${marginTop})`)
    .call(d3.axisTop(x).ticks(width / 80).tickSizeInner(4))
    .call(g => g.select(".domain").remove())
    .call(g => {
      if (source == 1)
        return g.append("text")
          .attr("x", width - marginRight)
          .attr("y", 10)
          .attr("fill", "grey")
          .attr("text-anchor", "start")
          .text("原煤生产量(万吨)")
      else if (source == 2)
        return g.append("text")
          .attr("x", width - marginRight)
          .attr("y", 10)
          .attr("fill", "grey")
          .attr("text-anchor", "start")
          .text("原油生产量(万吨)")
      else if (source == 3)
        return g.append("text")
          .attr("x", width - marginRight - 5)
          .attr("y", 10)
          .attr("fill", "grey")
          .attr("text-anchor", "start")
          .text("天然气生产量(亿立方米)")
      else if (source == 4)
        return g.append("text")
          .attr("x", width - marginRight)
          .attr("y", 10)
          .attr("fill", "grey")
          .attr("text-anchor", "start")
          .text("发电量(亿千瓦时)")
    }
    );

  svg.append("g")
    .attr("transform", `translate(${marginLeft},0)`)
    .call(d3.axisLeft(y).tickSizeOuter(0));

  return svg.node();

}

export default production;