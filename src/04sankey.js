import * as d3 from "d3";
import * as sankey from "d3-sankey";

function SSankey(data, {

  width = 800,
  height = 600,
  format = d3.format(",.2f")

} = {}) {

  // Create a SVG container.
  const svg = d3.select("#svg4")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("style", "width: auto; height: auto; font: 10px sans-serif;margin: 0 auto; display: block;");


  // Constructs and configures a Sankey generator.
  const sankeyy = sankey.sankey()
    .nodeId(d => { console.log(d); return d.name })
    .nodeAlign(sankey.sankeyJustify) // d3.sankeyLeft, etc.
    .nodeWidth(30)
    .nodePadding(50)
    .extent([[1, 5], [width - 1, height - 5]]);


  // Applies it to the data. We make a copy of the nodes and links objects
  // so as to avoid mutating the original.
  const { nodes, links } = sankeyy({
    nodes: data.rect.map(d => Object.assign({}, d)),
    links: data.line.link.map(d => Object.assign({}, d))
  });

  const color = d3.scaleOrdinal(d3.schemeCategory10);

  // Creates the rects that represent the nodes.
  const rect = svg.append("g")
    .attr("stroke", "#000")
    .selectAll()
    .data(nodes)
    .join("rect")
    .attr("x", d => d.x0)
    .attr("y", d => d.y0)
    .attr("height", d => d.y1 - d.y0)
    .attr("width", d => d.x1 - d.x0)
    .attr("fill", d => color(d.category));

  // Adds a title on the nodes.
  rect.append("title")
    .text(d => `${d.name}\n${format(d.value)} ×10^8t`);

  // Creates the paths that represent the links.
  const link = svg.append("g")
    .attr("fill", "none")
    .attr("stroke-opacity", 0.5)
    .selectAll()
    .data(links)
    .join("g")
    .style("mix-blend-mode", "multiply");


  link.append("path")
    .attr("d", sankey.sankeyLinkHorizontal())
    .attr("stroke", (d) => color(d.source.category))
    .attr("stroke-width", d => Math.max(1, d.width));

  link.append("title")
    .text(d => `${d.source.name} → ${d.target.name}\n${format(d.value)} ×10^8t`);

  // Adds labels on the nodes.
  svg.append("g")
    .selectAll()
    .data(nodes)
    .join("text")
    .attr("x", d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
    .attr("y", d => (d.y1 + d.y0) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", d => d.x0 < width / 2 ? "start" : "end")
    .text(d => d.name);

  return svg.node();


}

export default SSankey;