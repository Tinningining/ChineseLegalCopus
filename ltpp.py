# import re
# import os
# import shutil

# def extract_law_articles(legal_text):
#     # 只匹配法条，不再匹配章节
#     article_pattern = r'第([一二三四五六七八九十百]+|[0-9]+)条\s*[　]*([^\n]+(?:\n[^第]+)*)'
    
#     # 提取法条
#     article_matches = re.finditer(article_pattern, legal_text)
    
#     # 组合结果
#     result = []
    
#     for match in article_matches:
#         # 获取法条内容
#         article_content = match.group(2).strip()
        
#         # 去掉内部的空格和换行符
#         cleaned_content = re.sub(r'\s+', '', article_content)
        
#         # 添加到结果列表
#         result.append(cleaned_content)
    
#     return "\n".join(result)

# def should_skip_file(filename):
#     # 检查是否包含"修正案"或"关于修改...的决定"
#     skip_keywords = ["修正案", "关于修改", "的决定"]
#     return any(keyword in filename for keyword in skip_keywords)

# def process_law_files():
#     # 创建新文件夹
#     output_folder = "processed_law_files"
#     if not os.path.exists(output_folder):
#         os.makedirs(output_folder)
#         print(f"已创建新文件夹: {output_folder}")
    
#     # 获取当前目录下所有txt文件
#     txt_files = [f for f in os.listdir() if f.endswith('.txt')]
    
#     processed_count = 0
#     skipped_count = 0
    
#     for file_name in txt_files:
#         # 判断是否需要跳过
#         if should_skip_file(file_name):
#             print(f"跳过文件: {file_name}")
#             skipped_count += 1
#             continue
        
#         try:
#             # 读取法律文本文件
#             with open(file_name, 'r', encoding='utf-8') as file:
#                 legal_text = file.read()
            
#             # 提取法条
#             extracted_articles = extract_law_articles(legal_text)
            
#             # 构建输出文件路径（保持原文件名）
#             output_file_path = os.path.join(output_folder, file_name)
            
#             # 输出到新文件
#             with open(output_file_path, 'w', encoding='utf-8') as file:
#                 file.write(extracted_articles)
            
#             print(f"处理完成: {file_name}")
#             processed_count += 1
            
#         except Exception as e:
#             print(f"处理文件 {file_name} 时出错: {str(e)}")
    
#     print(f"\n处理完成! 共处理 {processed_count} 个文件，跳过 {skipped_count} 个文件。")
#     print(f"处理后的文件已保存至 {output_folder} 文件夹")

# if __name__ == "__main__":
#     process_law_files()


# -- coding: utf-8 --
from ltp import LTP
import sqlite3

# 初始化 LTP 模型
ltp = LTP("small1")

result = ltp.pipeline(["我是你妈。你是我姐姐，并且你爱我。"], tasks = ["cws","dep","pos"])
print(result.dep)
print(result.cws)
print(result.pos)