import * as d3 from "d3";

function supplydemand(data, {

    width = 700,
    height = 600,
    marginTop = 40,
    marginRight = 40,
    marginBottom = 0,
    marginLeft = 60,
} = {}) {

    // 创建SVG
    const svg = d3.select("#svg7")
        .attr("width", width)
        .attr("height", height)
        .attr("style", "width: 800; height: 700; font: 10px sans-serif;margin: 0 auto; display: block;");

    // 创建一个比例尺，将年份映射到X轴上的位置
    const xScale = d3.scaleBand()
        .domain(data.map(d => d.年份))
        .range([marginLeft, width - marginRight])

    // 创建一个比例尺，将资源消耗占比映射到Y1轴上的位置
    const y1Scale = d3.scaleLinear()
        .domain([0.2, 1.4])
        .range([height - marginBottom, marginTop]);


    const y2Scale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.过需消费量)).nice()
        .range([0.8 * marginTop, 0.8 * (height - marginBottom)]);

    const xShow = data.filter((d, i) => i % 5 == 0).map(d => d.年份);

    // 创建一个X轴、Y1轴、Y2轴生成器，用于在SVG中添加这些轴
    const xAxis = d3.axisBottom(xScale).tickValues(xShow).tickSizeOuter(0);
    const y1Axis = d3.axisLeft(y1Scale);
    const y2Axis = d3.axisRight(y2Scale);

    // 在SVG中添加X轴
    svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", "translate(0," + (y1Scale(1.0)) + ")")
        .call(xAxis)
        .call(g => g.selectAll(".tick text").filter((d, i) => xShow[i] > 1991).attr("y", -12));


    // 在SVG中添加Y1轴
    svg.append("g")
        .attr("class", "y1-axis")
        .attr("transform", "translate(" + marginLeft + ",0)")
        .call(y1Axis)
        .call(g => g.select(".domain").remove())
        .append("text")  // 添加Y1轴的标签
        .attr("x", 100) // 根据需要调整位置
        .attr("y", 10) // 根据需要调整位置
        .attr("dy", "0.71em")
        .attr("fill", "#000")
        .text("能源供需比（生产量/消费量）"); // Y1轴的标签名


    // 在SVG中添加Y2轴
    svg.append("g")
        .attr("class", "y2-axis")
        .attr("transform", "translate(" + (width - marginRight) + "," + (y1Scale(1.0) - y2Scale(0)) + ")")
        .call(y2Axis)
        .call(g => g.select(".domain").remove())
        .append("text")  // 添加Y2轴的标签
        .attr("x", 10) // 根据需要调整位置
        .attr("y", 10) // 根据需要调整位置
        .attr("dy", "0.71em")
        .attr("fill", "#000")
        .text("过需消费量（万吨标准煤）"); // Y2轴的标签名

    //过需消费量柱状图
    svg.selectAll(".bar")
        .data(data)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("fill", (d) => d3.schemeRdBu[3][d.过需消费量 > 0 ? 0 : 2])
        .attr("fill-opacity", "0.35")
        .attr("y", (d) => y2Scale(Math.min(d.过需消费量, 0)))
        .attr("x", (d) => xScale(d.年份))
        .attr("height", d => Math.abs(y2Scale(0) - y2Scale(d.过需消费量)))
        .attr("width", xScale.bandwidth())
        .attr("transform", "translate(0," + (y1Scale(1.0) - y2Scale(0)) + ")");

    // 创建煤炭曲线
    const line1 = d3.line()
        .x(d => xScale(d.年份) + xScale.bandwidth() / 2 )
        .y(d => y1Scale(d.原煤))

    // 创建石油曲线
    const line2 = d3.line()
        .x(d => xScale(d.年份) + xScale.bandwidth() / 2 )
        .y(d => y1Scale(d.原油))

    // 创建天然气曲线
    const line3 = d3.line()
        .x(d => xScale(d.年份) + xScale.bandwidth() / 2 )
        .y(d => y1Scale(d.天然气))

    // 创建一次电力及其他能源曲线
    const line4 = d3.line()
        .x(d => xScale(d.年份) + xScale.bandwidth() / 2 )
        .y(d => y1Scale(d.一次电力及其他能源))

    // 创建总体能源曲线
    const line5 = d3.line()
        .x(d => xScale(d.年份) + xScale.bandwidth() / 2 )
        .y(d => y1Scale(d.总量供需比))


    // 在SVG中绘制煤炭曲线
    svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "#D7191C")
        .attr("stroke-opacity", "0.55")
        .attr("stroke-width", 2)
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
        .attr("stroke-opacity", "0.55")
        .attr("stroke-width", 2)
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
        .attr("stroke-opacity", "0.55")
        .attr("stroke-width", 2)
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
        .attr("stroke-opacity", "0.55")
        .attr("stroke-width", 2)
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

    // 在SVG中绘制总体能源曲线
    svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "black")
        .attr("stroke-opacity", "0.85")
        .attr("stroke-width", 2)
        .attr("d", line5)
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

    // 添加总体图例
    legend.append("rect")
        .attr("x", 0)
        .attr("y", 100)
        .attr("width", 15)
        .attr("height", 15)
        .style("fill", "black");

    legend.append("text")
        .attr("x", 20)
        .attr("y", 110)
        .text("总量供需比")
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
        if (mouseX >= marginLeft && mouseX <= width - marginRight && mouseY >= marginTop && mouseY <= height - marginRight) {
            // 找到与鼠标位置相交的数据点
            const intersectedPoint = data.find(d => {
                const xValue = d.年份;
                return Math.abs(xScale(xValue) - mouseX) <= xScale.step() / 2; // 判断鼠标是否在数据点附近
            });

            // 判断是否存在相交的数据点
            if (intersectedPoint) {
                // 更新垂直线的位置
                verticalLine.attr("x1", xScale(intersectedPoint.年份)+ xScale.step() / 2) // 使用数据点的x值加上步长的一半
                    .attr("x2", xScale(intersectedPoint.年份)+ xScale.step() / 2) // 使用数据点的x值加上步长的一半
                    .attr("y1", marginTop)
                    .attr("y2", height + 35)
                    .style("opacity", 1); // 设置为不透明

                // 判断是否与当前年份相同
                if (intersectedPoint.年份 !== currentYear) {
                    // 更新当前年份
                    currentYear = intersectedPoint.年份;

                    // 获取需要显示的能源数据
                    const energyData = ["总量供需比", "原煤", "原油", "天然气", "一次电力及其他能源"];

                    // 添加圆点
                    const circles = svg.selectAll(".circle")
                        .data(energyData);

                    // 更新已存在的圆点
                    circles.attr("cx", xScale(intersectedPoint.年份)+ xScale.step() / 2) // 使用数据点的x值加上步长的一半
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
                            } else if (d === "总量供需比") {
                                return "black";
                            }
                        });

                    // 添加新的圆点
                    circles.enter().append("circle")
                        .attr("class", "circle")
                        .attr("cx", xScale(intersectedPoint.年份)+ xScale.step() / 2) // 使用数据点的x值加上步长的一半
                        .attr("cy", d => y1Scale(intersectedPoint[d]))
                        .attr("r", 0) // 初始设置为0
                        .style("fill", d => {
                            if (d === "原煤") {
                                return "#D7191C";
                            } else if (d === "原油") {
                                return "#2B83BA";
                            } else if (d === "天然气") {
                                return "#FDAE61";
                            } else if (d === "一次电力及其他能源") {
                                return "#ABDDA4";
                            } else if (d === "总量供需比") {
                                return "black";
                            }
                        })
                        .transition() // 添加过渡效果
                        .duration(500) // 过渡时间
                        .attr("r", 4); // 最终半径为4

                    // 移除不再相交的圆点
                    circles.exit().remove();

                    // 添加标签
                    const label = svg.selectAll(".label")
                    if (!label.empty()) {
                        label.remove();
                    }
                    // 根据年份判断标签位置
                    let labelX, labelY;
                    if (intersectedPoint.年份 > 2005) {
                        labelX = mouseX - 250; // 将标签位置设置为鼠标位置的左侧
                        labelY = mouseY - 40; // 将标签位置设置为鼠标位置的上方
                    } else {
                        labelX = mouseX + 20; // 将标签位置设置为鼠标位置的右侧
                        labelY = mouseY - 40; // 将标签位置设置为鼠标位置的上方
                    }
                    const labelContainer = svg.append("foreignObject")
                        .attr("class", "label")
                        .attr("x", labelX)
                        .attr("y", labelY)
                        .attr("width", 350) // 设置标签的宽度
                        .attr("height", 250); // 设置标签的高度
                    const labelDiv = labelContainer.append("xhtml:div")
                        .style("font-size", "14px")
                        .style("text-align", "left")  // 设置文本左对齐
                        .style("border-radius", "10px") // 设置10px的圆角
                        .html(`<div style="font-size: 20px; background-color: #E0E0E0; padding: 8px;">${" ".repeat(2)}${intersectedPoint.年份} 年</div>
                            <div style="background-color: #E0E0E0; padding: 8px;"> ${" ".repeat(2)}过需消费量：${intersectedPoint.过需消费量}</div>
                            <div style="font-size: 16px;">能源供需比</div>
                            <div><span style="display: inline-block; width: 8px; height: 8px; background-color: #D7191C; padding: 4px;"></span> 原煤：${intersectedPoint.原煤}</div>
                            <div><span style="display: inline-block; width: 8px; height: 8px; background-color: #2B83BA; padding: 4px;"></span> 原油：${intersectedPoint.原油}</div>
                            <div><span style="display: inline-block; width: 8px; height: 8px; background-color: #FDAE61; padding: 4px;"></span> 天然气：${intersectedPoint.天然气}</div>
                            <div><span style="display: inline-block; width: 8px; height: 8px; background-color: #ABDDA4; padding: 4px;"></span> 一次电力及其他能源：${intersectedPoint.一次电力及其他能源}</div>
                            <div><span style="display: inline-block; width: 8px; height: 8px; background-color: #000000; padding: 4px;"></span> 总量供需比：${intersectedPoint.总量供需比}</div>`);
                    // 添加阴影效果
                    labelDiv.style("box-shadow", "2px 2px 5px rgba(0, 0, 0, 0.3)");

                    // 高亮对应年份的柱子
                    svg.selectAll(".bar")
                        .attr("fill-opacity", function (d) {
                            // 判断当前柱子对应的年份是否与鼠标位置的数据点相等
                            if (d.年份 === intersectedPoint.年份) {
                                return 1; // 高亮显示的透明度
                            } else {
                                return 0.35; // 默认透明度
                            }
                        });


                }
            }
        }
        else {
            // 如果鼠标不与任何数据点相交，则隐藏垂直线和相关元素
            verticalLine.style("opacity", 0);
            svg.selectAll(".circle").remove();
            svg.selectAll(".label").remove();
            svg.selectAll(".bar").attr("fill-opacity", 0.35);

            // 重置当前年份为null
            currentYear = null;
        }
    });

    return svg.node();

}

export default supplydemand;