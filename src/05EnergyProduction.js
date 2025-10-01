import * as d3 from "d3";

function EnergyProduction(data, {

    width = 700,
    height = 600,
    marginTop = 40,
    marginRight = 40,
    marginBottom = 0,
    marginLeft = 60,
} = {}) {

    // 创建SVG
    const svg = d3.select("#svg5")
        .attr("width", width)
        .attr("height", height)
        .attr("style", "width: 820; height: 700; font: 10px sans-serif;margin: 0 auto; display: block;");

    // 创建一个比例尺，将年份映射到X轴上的位置
    const xScale = d3.scaleBand()
        .domain(data.map(d => d.年份))
        .range([marginLeft, width - marginRight])
        .padding(0.1);

    // 创建一个比例尺，将资源消耗占比映射到Y1轴上的位置
    const y1Scale = d3.scaleLinear()
        .domain([0, 100])
        .range([height - marginBottom, marginTop]);

    // 创建一个比例尺，将资源消耗占比映射到Y2轴上的位置
    const y2Scale = d3.scaleLinear()
        .domain([0, d3.max(data, d => Math.max(d.能源生产总量))]).nice()
        .range([height - marginBottom, marginTop]);

    const xShow = data.filter((d, i) => i % 5 == 0).map(d => d.年份);

    // 创建一个X轴、Y1轴、Y2轴生成器，用于在SVG中添加这些轴
    const xAxis = d3.axisBottom(xScale).tickValues(xShow).tickSizeOuter(0);
    const y1Axis = d3.axisLeft(y1Scale);
    const y2Axis = d3.axisRight(y2Scale);

    // 在SVG中添加X轴
    svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", "translate(0," + (height - marginBottom) + ")")
        .call(xAxis);

    // 在SVG中添加Y1轴
    svg.append("g")
        .attr("class", "y1-axis")
        .attr("transform", "translate(" + marginLeft + ",0)")
        .call(y1Axis)
        .call(g => g.select(".domain").remove())
        .append("text")  // 添加Y1轴的标签
        .attr("x", 10) // 根据需要调整位置
        .attr("y", 10) // 根据需要调整位置
        .attr("dy", "0.71em")
        .attr("fill", "#000")
        .text("能源生产占比"); // Y1轴的标签名

    // 在SVG中添加Y2轴
    svg.append("g")
        .attr("class", "y2-axis")
        .attr("transform", "translate(" + (width - marginRight) + ",0)")
        .call(y2Axis)
        .call(g => g.select(".domain").remove())
        .append("text")  // 添加Y2轴的标签
        .attr("x", 10) // 根据需要调整位置
        .attr("y", 10) // 根据需要调整位置
        .attr("dy", "0.71em")
        .attr("fill", "#000")
        .text("能源生产总量（万吨标准煤）"); // Y2轴的标签名

    //添加柱状图
    svg.selectAll(".bar")
        .data(data)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", function (d) { return xScale(d.年份); })
        .attr("width", xScale.bandwidth())
        .attr("y", function (d) { return y2Scale(d.能源生产总量); })
        .attr("height", function (d) { return y2Scale(0) - y2Scale(d.能源生产总量); })
        .attr("fill", "#A4B6CA")

    // 创建煤炭曲线
    const line1 = d3.line()
        .x(d => xScale(d.年份) + xScale.bandwidth() / 2)
        .y(d => y1Scale(d.原煤))

    // 创建石油曲线
    const line2 = d3.line()
        .x(d => xScale(d.年份) + xScale.bandwidth() / 2)
        .y(d => y1Scale(d.原油))

    // 创建天然气曲线
    const line3 = d3.line()
        .x(d => xScale(d.年份) + xScale.bandwidth() / 2)
        .y(d => y1Scale(d.天然气))

    // 创建一次电力及其他能源曲线
    const line4 = d3.line()
        .x(d => xScale(d.年份) + xScale.bandwidth() / 2)
        .y(d => y1Scale(d.一次电力及其他能源))

    // 在SVG中绘制煤炭曲线
    svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "#D7191C")
        .attr("stroke-width", 2.5)
        .attr("d", line1)
        .style("stroke-linejoin", "round") // 设置线段连接处为圆角
        .style("stroke-linecap", "round") // 设置线段末端为圆角
        .transition()
        .duration(1000)
        .attrTween("stroke-dasharray", function () {
            const length = this.getTotalLength();
            return function (t) {
                return d3.interpolateString("0," + length, length + "," + length)(t);
            };
        });

    // 在SVG中绘制石油曲线
    svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "#2B83BA")
        .attr("stroke-width", 2.5)
        .attr("d", line2)
        .style("stroke-linejoin", "round") // 设置线段连接处为圆角
        .style("stroke-linecap", "round") // 设置线段末端为圆角
        .transition()
        .duration(1000)
        .attrTween("stroke-dasharray", function () {
            const length = this.getTotalLength();
            return function (t) {
                return d3.interpolateString("0," + length, length + "," + length)(t);
            };
        });

    // 在SVG中绘制天然气曲线
    svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "#FDAE61")
        .attr("stroke-width", 2.5)
        .attr("d", line3)
        .style("stroke-linejoin", "round") // 设置线段连接处为圆角
        .style("stroke-linecap", "round") // 设置线段末端为圆角
        .transition()
        .duration(1000)
        .attrTween("stroke-dasharray", function () {
            const length = this.getTotalLength();
            return function (t) {
                return d3.interpolateString("0," + length, length + "," + length)(t);
            };
        });

    // 在SVG中绘制一次电力及其他能源曲线
    svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "#ABDDA4")
        .attr("stroke-width", 2.5)
        .attr("d", line4)
        .style("stroke-linejoin", "round") // 设置线段连接处为圆角
        .style("stroke-linecap", "round") // 设置线段末端为圆角
        .transition()
        .duration(1000)
        .attrTween("stroke-dasharray", function () {
            const length = this.getTotalLength();
            return function (t) {
                return d3.interpolateString("0," + length, length + "," + length)(t);
            };
        });

    // 在SVG中添加图例
    const legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", "translate(" + (width - marginRight + 60) + "," + (marginTop) + ")");

    // 添加原煤图例项
    legend.append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", 15)
        .attr("height", 15)
        .style("fill", "#D7191C");

    legend.append("text")
        .attr("x", 20)
        .attr("y", 10)
        .text("原煤")
        .style("font-size", "12px");

    // 添加原油图例项
    legend.append("rect")
        .attr("x", 0)
        .attr("y", 20)
        .attr("width", 15)
        .attr("height", 15)
        .style("fill", "#2B83BA");

    legend.append("text")
        .attr("x", 20)
        .attr("y", 30)
        .text("原油")
        .style("font-size", "12px");

    // 添加天然气图例项
    legend.append("rect")
        .attr("x", 0)
        .attr("y", 40)
        .attr("width", 15)
        .attr("height", 15)
        .style("fill", "#FDAE61");

    legend.append("text")
        .attr("x", 20)
        .attr("y", 50)
        .text("天然气")
        .style("font-size", "12px");

    // 添加电力图例项
    legend.append("rect")
        .attr("x", 0)
        .attr("y", 60)
        .attr("width", 15)
        .attr("height", 15)
        .style("fill", "#ABDDA4");

    legend.append("text")
        .attr("x", 20)
        .attr("y", 70)
        .text("一次电力及")
        .style("font-size", "12px");
    legend.append("text")
        .attr("x", 20)
        .attr("y", 90)
        .text("其他能源")
        .style("font-size", "12px");

    // 添加垂直线
    const verticalLine = svg.append("line")
        .attr("class", "vertical-line")
        .style("stroke", "#636363")
        .style("stroke-width", 1)
        .style("opacity", 0); // 初始设置为透明

    // 声明一个变量用于记录当前竖直线所在的年份
    let currentYear = null;

    // 监听鼠标移动事件
    svg.on("mousemove", function (event) {
        // 获取鼠标在SVG中的位置
        const mouseX = d3.pointer(event)[0];
        const mouseY = d3.pointer(event)[1];

        // 判断鼠标是否在图表范围内
        if (mouseX >= marginLeft && mouseX <= width - marginRight && mouseY >= marginTop && mouseY <= height) {
            // 找到与鼠标位置相交的数据点
            const intersectedPoint = data.find(d => {
                const xValue = d.年份;
                return Math.abs(xScale(xValue) - mouseX) <= xScale.step() / 2; // 判断鼠标是否在数据点附近
            });

            // 判断是否存在相交的数据点
            if (intersectedPoint) {
                // 更新垂直线的位置
                verticalLine.attr("x1", xScale(intersectedPoint.年份) + xScale.step() / 2) // 使用数据点的x值加上步长的一半
                    .attr("x2", xScale(intersectedPoint.年份) + xScale.step() / 2) // 使用数据点的x值加上步长的一半
                    .attr("y1", marginTop)
                    .attr("y2", height - marginBottom)
                    .style("opacity", 1); // 设置为不透明

                // 判断是否与当前年份相同
                if (intersectedPoint.年份 !== currentYear) {
                    // 更新当前年份
                    currentYear = intersectedPoint.年份;

                    // 移除上一个饼图
                    svg.selectAll(".pie-chart").remove();

                    // 绘制饼图
                    pie(intersectedPoint, mouseX, mouseY);

                    // 获取需要显示的能源数据
                    const value = ["原煤", "原油", "天然气", "一次电力及其他能源"];

                    // 添加圆点
                    const circles = svg.selectAll(".circle")
                        .data(value);

                    // 更新已存在的圆点
                    circles.attr("cx", xScale(intersectedPoint.年份) + xScale.step() / 2) // 使用数据点的x值加上步长的一半
                        .attr("cy", d => y1Scale(intersectedPoint[d]))
                        .style("fill", d => {
                            if (d === "原煤") {
                                return "#D7191C";
                            } else if (d === "原油") {
                                return "#2B83BA";
                            } else if (d === "天然气") {
                                return "#FDAE61";
                            } else if (d === "一次电力及其他能源") {
                                return "#ABDDA4";
                            }
                        });

                    // 添加新的圆点
                    circles.enter().append("circle")
                        .attr("class", "circle")
                        .attr("cx", xScale(intersectedPoint.年份) + xScale.step() / 2) // 使用数据点的x值加上步长的一半
                        .attr("cy", d => y1Scale(intersectedPoint[d]))
                        .attr("r", 4)
                        .style("fill", d => {
                            if (d === "原煤") {
                                return "#D7191C";
                            } else if (d === "原油") {
                                return "#2B83BA";
                            } else if (d === "天然气") {
                                return "#FDAE61";
                            } else if (d === "一次电力及其他能源") {
                                return "#ABDDA4";
                            }
                        });

                    // 移除不再相交的圆点
                    circles.exit().remove();

                    // 添加标签
                    const labels = svg.selectAll(".label")
                        .data(value);

                    // 更新已存在的标签
                    labels.attr("x", xScale(intersectedPoint.年份) + xScale.step() / 2) // 使用数据点的x值加上步长的一半
                        .attr("y", (d, i) => {
                            if (d === "原煤") {
                                return y1Scale(intersectedPoint[d]) - 20;
                            } else if (d === "原油") {
                                return y1Scale(intersectedPoint[d]) - 30;
                            } else if (d === "天然气") {
                                return y1Scale(intersectedPoint[d]) + 50;
                            } else if (d === "一次电力及其他能源") {
                                return y1Scale(intersectedPoint[d]) - 40;
                            }
                        })
                        .text(d => `${d}: ${intersectedPoint[d]}`);

                    // 添加新的标签
                    const newLabels = labels.enter()
                        .append("text")
                        .attr("class", "label")
                        .attr("x", xScale(intersectedPoint.年份) + xScale.step() / 2) // 使用数据点的x值加上步长的一半
                        .merge(labels)
                        .attr("y", (d, i) => {
                            if (d === "原煤") {
                                return y1Scale(intersectedPoint[d]) - 20;
                            } else if (d === "原油") {
                                return y1Scale(intersectedPoint[d]) - 30;
                            } else if (d === "天然气") {
                                return y1Scale(intersectedPoint[d]) + 50;
                            } else if (d === "一次电力及其他能源") {
                                return y1Scale(intersectedPoint[d]) - 40;
                            }
                        })
                        .text(d => `${d}: ${intersectedPoint[d]}`)
                        .style("font-size", "12px");

                    // 移除不再相交的标签
                    labels.exit().remove();

                    // 将新的标签放到最顶层（避免被饼图挡住）
                    newLabels.raise();

                    // 添加年份标签
                    const yearLabel = svg.select(".year-label");
                    if (!yearLabel.empty()) {
                        yearLabel.remove();
                    }
                    svg.append("text")
                        .attr("class", "year-label")
                        .attr("x", xScale(intersectedPoint.年份))
                        .attr("y", 30)
                        .text(`${intersectedPoint.年份} 年 能源生产总量：${intersectedPoint.能源生产总量}`).style("font-size", "12px");

                    // 高亮对应年份的柱子
                    svg.selectAll(".bar")
                        .attr("fill", d => d.年份 === intersectedPoint.年份 ? "#48CF88" : "#A4B6CA");
                }
            }
        }
        else {
            // 如果鼠标不与任何数据点相交，则隐藏垂直线和相关元素
            verticalLine.style("opacity", 0);
            svg.selectAll(".circle").remove();
            svg.selectAll(".label").remove();
            svg.select(".year-label").remove();
            svg.selectAll(".pie-chart").remove();
            svg.selectAll(".bar").attr("fill", "#A4B6CA");
            // 重置当前年份为null
            currentYear = null;
        }
    });
    // 绘制饼图的函数
    function pie(dataPoint, mouseX, mouseY) {
        const value = ["原煤", "原油", "天然气", "一次电力及其他能源"];

        // 创建颜色比例尺
        const color = d3.scaleOrdinal()
            .domain(value)
            .range(["#D7191C", "#2B83BA", "#FDAE61", "#ABDDA4"]);

        // 创建饼图布局
        const pie = d3.pie()
            .value(d => dataPoint[d])

        // 定义饼图半径
        const radius = Math.min((width - marginRight - marginLeft), (height - marginTop - marginBottom)) / 10;

        // 根据年份判断饼图位置
        let pieX;
        if (dataPoint.年份 < 1985) {
            pieX = mouseX + 70;
        } else if (dataPoint.年份 >= 1985 && dataPoint.年份 < 2005) {
            pieX = mouseX - 70;
        } else {
            pieX = mouseX + 70;
        }

        // 创建弧生成器
        const arc = d3.arc()
            .innerRadius(0)
            .outerRadius(radius);

        // 绘制饼图
        const arcs = svg.append("g")
            .attr("class", "pie-chart")
            .attr("transform", `translate(${pieX},${mouseY + 30})`) // 设置饼图位置为鼠标位置的偏移量
            .selectAll(".arc")
            .data(pie(value))
            .enter().append("g")
            .attr("class", "arc");

        arcs.append("path")
            .attr("d", arc)
            .attr("fill", d => color(d.data))
            .attr("stroke", "white");

        // 添加标签
        arcs.append("text")
            .attr("transform", d => `translate(${arc.centroid(d)})`)
            .attr("text-anchor", "middle")
            .text(d => {
                const percentage = (d.endAngle - d.startAngle) / (2 * Math.PI) * 100;
                return `${percentage.toFixed(1)}%`;//保留一位小数
            });

    }
    return svg.node();

}

export default EnergyProduction;