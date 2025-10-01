function Bar(data, {
    width = '100%',   // 设置为 100%
    height = '100%',  // 设置为 100%
} = {}) {

  // 获取父容器的实际宽度和高度
  const svgContainer = d3.select("#svg2").node().parentNode;
  const containerWidth = svgContainer.clientWidth;
  const containerHeight = svgContainer.clientHeight;

  // 设置 margin 参数 (可选)
  const marginTop = 30;
  const marginRight = 20;
  const marginBottom = 50;
  const marginLeft = 40;

  // 创建 x 轴比例尺
  const x = d3.scaleBand()
      .domain(data.map(d => d.category))
      .range([marginLeft, containerWidth - marginRight])
      .padding(0.1);

  // 创建 y 轴比例尺
  const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.count)]).nice()
      .range([containerHeight - marginBottom, marginTop]);

  // 创建 SVG 容器
  const svg = d3.select("#svg2")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${containerWidth} ${containerHeight}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("style", "width: 100%; height: 100%; font: 10px sans-serif;");

  // 绘制柱状图
  svg.append("g")
      .attr("fill", "steelblue")
    .selectAll("rect")
    .data(data)
    .join("rect")
      .attr("x", d => x(d.category))
      .attr("y", d => y(d.count))
      .attr("height", d => y(0) - y(d.count))
      .attr("width", x.bandwidth());

  // 绘制 y 轴
  svg.append("g")
      .attr("transform", `translate(${marginLeft},0)`)
      .call(d3.axisLeft(y).ticks(10))
      .call(g => g.select(".domain").remove());

  // 绘制 x 轴
  svg.append("g")
      .attr("transform", `translate(0,${containerHeight - marginBottom})`)
      .call(d3.axisBottom(x).tickSizeOuter(0))
      .selectAll("text")
      .style("text-anchor", "end")
      .attr("dx", "-0.8em")
      .attr("dy", "0.15em")
      .attr("transform", "rotate(-40)");

  return svg.node();
}
