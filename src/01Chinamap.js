import * as d3 from "d3";

function Chinamap(csv1, data, source, {
  width = 800,
  height = 700
} = {}) {
  console.log(source);


  //映射圆圈大小
  const radius = d3.scaleSqrt([0, d3.max(data, d => {
    if (source == 1) return +d.原煤生产量;
    else if (source == 2) return +d.原油生产量;
    else if (source == 3) return +d.天然气生产量;
    else if (source == 4) return +d.发电量;
  })], [0, 3]);

  //定义画地理图形的函数
  const path = d3.geoPath();

  //更改数据结构
  const dataa = data.map((d, i) => ({
    ...d,
    province: csv1.features[i],
  }))

  //选择svg，开始画图
  const svg = d3.select("#svg1")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("style", " height: auto;");

  //画地图
  svg.append("path")
    .datum(csv1)
    .attr("fill", "#CCC")
    .attr("stroke", "black")
    .attr("stroke-width", "0.03")
    .attr("stroke-linejoin", "round")
    .attr("transform", "translate(-850,700) scale(12,-12)")
    .attr("d", path);

  //定义centroid函数
  const centroid = feature => path.centroid(feature);
  const format = d3.format(" ");

  //画圈圈
  const circles = svg
    .append("g")
    .attr("fill", d => {
      if (source == 1) return "#D7191C";
      else if (source == 2) return "#2B83BA";
      else if (source == 3) return "#FDAE61";
      else if (source == 4) return "#ABDDA4";
    })
    .attr("fill-opacity", 0.5)
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.01)
    .selectAll()
    .data(dataa)
    .join("circle")
    .attr("cx", d => centroid(d.province)[0])
    .attr("cy", d => centroid(d.province)[1])
    .attr("transform", "translate(-850,700) scale(12,-12)")
    .attr("r", d => {
      if (source == 1) return radius(d.原煤生产量);
      else if (source == 2) return radius(d.原油生产量);
      else if (source == 3) return radius(d.天然气生产量);
      else if (source == 4) return radius(d.发电量);
    })

  circles
    .on("mouseover", function (event, d) {//鼠标悬停
      d3.select(this).attr("fill-opacity", 1); // 填充透明度为 1，高亮状态
    })
    .on("mouseout", function (event, d) {//鼠标移出
      d3.select(this).attr("fill-opacity", 0.5); // 填充透明度为 0.5，默认状态
    })
    .append("title")
    .text((d) => {
      if (source == 1) return `${d.地区}:${format(d.原煤生产量)}${"万吨"}`;
      else if (source == 2) return `${d.地区}:${format(d.原油生产量)}${"万吨"}`;
      else if (source == 3)
        return `${d.地区}:${format(d.天然气生产量)}${"亿立方米"}`;
      else if (source == 4) return `${d.地区}:${format(d.发电量)}${"亿千瓦时"}`;
    });

  //画图例
  const legend = svg.append("g")
    .attr("fill", "#777")
    .attr("transform", "translate(700,600)")
    .attr("text-anchor", "middle")
    .style("font", "10px sans-serif")
    .selectAll()
    .data(radius.ticks(6).slice(1))
    .join("g");

  legend.append("circle")
    .attr("fill", "none")
    .attr("stroke", "black")
    .attr("stroke-width", 0.01)
    .attr("cy", d => -radius(d))
    .attr("r", radius)
    .attr("transform", "scale(12,12)")

  legend.append("text")
    .attr("y", d => -2 * radius(d) * 12)
    .attr("dy", "1.3em")
    .text(radius.tickFormat(5, "s"));

  return svg.node();
}

export default Chinamap;

