   import { Notice, TFolder } from 'obsidian';

   /**
    * Validate the folder, create if needed, and return its path or null.
    */
   export async function validateNewFolder(newFolder: string, folderType: string): Promise<string | null> {
     if (!newFolder) return null;
     if (newFolder.length > 1 && /^[/\\]/.test(newFolder)) {
       newFolder = newFolder.substring(1);
     }
     let newFolderFile = app.vault.getAbstractFileByPath(newFolder);
     if (!newFolderFile) {
       try {
         newFolderFile = await app.vault.createFolder(newFolder);
         new Notice(`New folder ${newFolderFile.path} created.`);
       } catch (error) {
         new Notice(`Folder ${newFolder} creation failed: ${error}. Please correct and try again.`, 5000);
         return null;
       }
     }
     if (newFolderFile instanceof TFolder) {
       new Notice(`${folderType} folder is now ${newFolderFile.path}.`);
       return newFolderFile.path;
     }
     return null;
   }
